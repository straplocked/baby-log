<?php

namespace App\Console\Commands;

use App\Models\Shift;
use App\Models\User;
use App\Services\PushService;
use Illuminate\Console\Command;

/**
 * Runs every minute via the scheduler. Each reminder kind fires at most once
 * per triggering event (per feed, per nap, per day) — the dedupe lives in
 * users.notify_state, so a restart can't double-ping anyone.
 */
class SendReminders extends Command
{
    protected $signature = 'babylog:reminders';

    protected $description = 'Send due push reminders (feed gap, wake window, daily meds)';

    /** Feeds closer together than this are one cluster session, not a new rhythm beat. */
    private const CLUSTER_GAP_MS = 45 * 60000;

    /** Age-typical max wake window in minutes — [max age in weeks, minutes], from docs/feeding-patterns.md. */
    private const MAX_WAKE_MINS = [
        [4, 90], [13, 90], [17, 120], [22, 150], [30, 180],
        [43, 210], [61, 240], [104, 360], [999, 360],
    ];

    public function handle(PushService $push): void
    {
        $this->untilReminder($push);

        $users = User::whereHas('pushSubscriptions')->with(['household.baby'])->get();
        foreach ($users as $user) {
            if (! $user->household) {
                continue;
            }
            $p = $user->notifyPrefs();
            if (! ($p['feed'] || $p['wake'] || $p['meds']) || $user->inQuietHours()) {
                continue;
            }
            $state = $user->notify_state ?? [];
            $dirty = $this->feedReminder($push, $user, $p, $state);
            $dirty = $this->wakeReminder($push, $user, $p, $state) || $dirty;
            $dirty = $this->medsReminder($push, $user, $p, $state) || $dirty;
            if ($dirty) {
                $user->update(['notify_state' => $state]);
            }
        }
    }

    /**
     * An active shift's clock-time "until" has passed: ping the shift-holder
     * ("hand back?") and the partner (their counterpart), once, and change
     * nothing — duty only ever moves through an explicit handback. The marker
     * lives on the shift row (until_notified_at), so the every-minute schedule
     * can't re-fire it; it is stamped before pushing so a transport hiccup
     * degrades to a missed ping, never a nightly spam loop.
     */
    private function untilReminder(PushService $push): void
    {
        $now = now()->getTimestampMs();
        $due = Shift::where('state', 'active')
            ->whereNotNull('until_at')
            ->where('until_at', '<=', $now)
            ->whereNull('until_notified_at')
            ->with(['household.users', 'household.baby'])
            ->get();
        foreach ($due as $shift) {
            $shift->update(['until_notified_at' => $now]);
            $household = $shift->household;
            $holder = $household?->users->firstWhere('id', $shift->user_id);
            if (! $holder) {
                continue;
            }
            $partner = $household->partnerOf($holder);
            $baby = $household->baby?->name ?? 'the baby';
            $said = $shift->until ? lcfirst($shift->until) : 'until about now';
            if ($holder->notifyPrefs()['handoff'] && ! $holder->inQuietHours()) {
                $push->notify(
                    $holder,
                    'shift',
                    'Shift over — hand back?',
                    'You said '.$said.' — nothing changes until you hand '.$baby.' back.',
                );
            }
            if ($partner && $partner->notifyPrefs()['handoff'] && ! $partner->inQuietHours()) {
                $push->notify(
                    $partner,
                    'shift',
                    $holder->name.'’s shift is up',
                    'They said '.$said.' — ready to take '.$baby.' back?',
                );
            }
        }
    }

    private function feedReminder(PushService $push, User $user, array $p, array &$state): bool
    {
        if (! $p['feed']) {
            return false;
        }
        $hh = $user->household;
        if ($p['onDutyOnly'] && $hh->on_duty_user_id && $hh->on_duty_user_id !== $user->id) {
            return false;
        }
        $now = now()->getTimestampMs();
        $ts = $hh->entries()
            ->whereIn('type', ['bottle', 'nurse'])->where('deleted', false)
            ->where('t', '>', $now - 48 * 3600000)->where('t', '<=', $now)
            ->orderBy('t')->pluck('t')->all();
        if (! $ts) {
            return false;
        }
        $starts = $this->sessionStarts($ts);
        $lastStart = end($starts);
        $gap = $p['feedEvery'] ? $p['feedEvery'] * 60000 : $this->rhythmGap($starts);
        if ($now < $lastStart + $gap) {
            return false;
        }
        if ($now - $lastStart > 12 * 3600000) {
            return false; // log has gone quiet — a reminder now would just be noise
        }
        if (($state['feedFor'] ?? null) === $lastStart) {
            return false; // already nudged about this feed
        }
        $state['feedFor'] = $lastStart;
        $push->notify(
            $user,
            'feed',
            ($hh->baby?->name ?? 'The baby').' is probably getting hungry',
            'Last fed '.$this->dur($now - end($ts)).' ago — usually every ~'.$this->dur($gap).'.',
        );

        return true;
    }

    private function wakeReminder(PushService $push, User $user, array $p, array &$state): bool
    {
        if (! $p['wake']) {
            return false;
        }
        $hh = $user->household;
        if (($hh->settings['tracking']['sleep'] ?? true) === false || ! $hh->baby?->birthdate) {
            return false;
        }
        $now = now()->getTimestampMs();
        // sleep entries are stamped at the nap's end, so t is when the wake window opened
        $last = $hh->entries()->where('type', 'sleep')->where('deleted', false)
            ->where('t', '<=', $now)->orderByDesc('t')->first();
        if (! $last) {
            return false;
        }
        $awake = $now - $last->t;
        $weeks = (int) floor(max(0, $now - strtotime($hh->baby->birthdate.'T00:00:00') * 1000) / (7 * 86400000));
        $maxWake = $this->maxWakeMins($weeks) * 60000;
        // past 8h it's overnight or unlogged sleep, not a stretched wake window
        if ($awake < $maxWake || $awake > 8 * 3600000) {
            return false;
        }
        if (($state['wakeFor'] ?? null) === $last->t) {
            return false;
        }
        $state['wakeFor'] = $last->t;
        $push->notify(
            $user,
            'wake',
            ($hh->baby->name ?? 'The baby').' has been awake a while',
            'About '.$this->dur($awake).' since the last logged nap — typical max for their age is '.$this->dur($maxWake).'.',
        );

        return true;
    }

    private function medsReminder(PushService $push, User $user, array $p, array &$state): bool
    {
        if (! $p['meds']) {
            return false;
        }
        $hh = $user->household;
        if (($hh->settings['tracking']['meds'] ?? true) === false) {
            return false;
        }
        try {
            $local = now($p['tz'] ?: config('app.timezone'));
        } catch (\Throwable) {
            $local = now();
        }
        if ($local->format('H:i') < $p['medsTime']) {
            return false;
        }
        $today = $local->toDateString();
        if (($state['medsDay'] ?? null) === $today) {
            return false;
        }
        // one decision per day, push or not — logged meds settle it quietly
        $state['medsDay'] = $today;
        $given = $hh->entries()->where('type', 'meds')->where('deleted', false)
            ->where('t', '>=', $local->copy()->startOfDay()->getTimestampMs())->exists();
        if (! $given) {
            $push->notify($user, 'meds', 'Meds time', 'Nothing logged for '.($hh->baby?->name ?? 'the baby').' yet today.');
        }

        return true;
    }

    /** First feed of each session, mirroring the client's cluster-feed folding. */
    private function sessionStarts(array $ts): array
    {
        $out = [];
        foreach ($ts as $i => $t) {
            if ($i === 0 || $t - $ts[$i - 1] > self::CLUSTER_GAP_MS) {
                $out[] = $t;
            }
        }

        return $out;
    }

    /** Learned gap between feed sessions, clamped so odd data can't spam or go silent. */
    private function rhythmGap(array $starts): int
    {
        $starts = array_slice($starts, -14);
        $gaps = [];
        for ($i = 1; $i < count($starts); $i++) {
            $gaps[] = $starts[$i] - $starts[$i - 1];
        }
        $avg = $gaps ? array_sum($gaps) / count($gaps) : 3 * 3600000;

        return (int) max(90 * 60000, min(6 * 3600000, $avg));
    }

    private function maxWakeMins(int $weeks): int
    {
        foreach (self::MAX_WAKE_MINS as [$max, $mins]) {
            if ($weeks < $max) {
                return $mins;
            }
        }

        return 360;
    }

    private function dur(int $ms): string
    {
        $m = (int) round($ms / 60000);
        if ($m < 60) {
            return $m.'m';
        }
        $h = intdiv($m, 60);

        return $h.'h'.($m % 60 ? ' '.($m % 60).'m' : '');
    }
}
