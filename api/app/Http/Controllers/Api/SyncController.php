<?php

namespace App\Http\Controllers\Api;

use App\Events\HouseholdTouched;
use App\Http\Controllers\Controller;
use App\Models\Entry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SyncController extends Controller
{
    /**
     * Single polling endpoint: everything the client needs to converge.
     * ?since=<ms> limits entries to ones written after that server revision.
     */
    public function state(Request $request): JsonResponse
    {
        $user = $request->user();
        $household = $user->household()->with(['users', 'baby'])->first();
        $since = (int) $request->query('since', 0);

        $partner = $household->partnerOf($user);
        $entries = $household->entries()
            ->where('rev', '>', $since)
            ->orderBy('rev')
            ->limit(2000)
            ->get(['id', 'user_id', 'type', 't', 'detail', 'deleted', 'rev']);

        $shift = $household->shifts()->latest('id')->first();

        return response()->json([
            'user' => ['id' => $user->id, 'name' => $user->name, 'householdId' => $user->household_id],
            'partner' => $partner ? ['id' => $partner->id, 'name' => $partner->name] : null,
            'invitePending' => $household->invite_email,
            'baby' => $household->baby ? ['name' => $household->baby->name, 'age' => $household->baby->age_label, 'birthdate' => $household->baby->birthdate] : null,
            'onDutyUserId' => $household->on_duty_user_id,
            'settings' => $household->settings,
            'shift' => $shift,
            'entries' => $entries,
            'serverTime' => now()->getTimestampMs(),
        ]);
    }

    public function setBaby(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'age' => ['nullable', 'string', 'max:40'],
            'birthdate' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:today', 'after:2015-01-01'],
        ]);

        $household = $request->user()->household;
        // only touch fields the client sent — a client that doesn't know the DOB must not erase it
        $values = ['name' => $data['name']];
        if (array_key_exists('age', $data)) {
            $values['age_label'] = $data['age'];
        }
        if (array_key_exists('birthdate', $data)) {
            $values['birthdate'] = $data['birthdate'];
        }
        $household->baby()->updateOrCreate(['household_id' => $household->id], $values);

        HouseholdTouched::send($household->id, 'baby');

        return response()->json(['ok' => true]);
    }

    public function invite(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:255']]);

        $household = $request->user()->household;
        if ($household->users()->count() >= config('babylog.max_household_users')) {
            return response()->json(['message' => 'This log already has both grown-ups.'], 422);
        }

        // single-use code, shown once to the inviter; the partner enters it at sign-up
        $code = '';
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        for ($i = 0; $i < 6; $i++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        $household->update([
            'invite_email' => strtolower($data['email']),
            'invite_code_hash' => hash('sha256', $code),
        ]);

        HouseholdTouched::send($household->id, 'invite');

        return response()->json(['ok' => true, 'code' => $code]);
    }

    /** Trackers the household can switch off; feeds are core and not listed. */
    private const TRACKS = ['pump', 'diapers', 'sleep', 'bath', 'meds'];

    /** Household-level preferences (tracking toggles + dismissed nudges). Last write wins. */
    public function setSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tracking' => ['sometimes', 'array'],
            'tracking.*' => ['boolean'],
            'dismissed' => ['sometimes', 'array', 'max:20'],
            'dismissed.*' => ['string', 'max:30'],
        ]);

        $household = $request->user()->household;
        $settings = $household->settings ?? [];
        if (array_key_exists('tracking', $data)) {
            $settings['tracking'] = array_map(
                fn ($v) => (bool) $v,
                array_intersect_key($data['tracking'], array_flip(self::TRACKS)),
            );
        }
        if (array_key_exists('dismissed', $data)) {
            $settings['dismissed'] = array_values(array_intersect($data['dismissed'], self::TRACKS));
        }
        $household->update(['settings' => $settings]);

        HouseholdTouched::send($household->id, 'settings');

        return response()->json(['ok' => true, 'settings' => $settings]);
    }

    /** Batch upsert from the client outbox. Client ids win; latest write wins. */
    public function pushEntries(Request $request): JsonResponse
    {
        $data = $request->validate([
            'entries' => ['required', 'array', 'max:500'],
            'entries.*.id' => ['required', 'string', 'max:64'],
            'entries.*.type' => ['required', 'string', 'max:20'],
            'entries.*.t' => ['required', 'integer'],
            'entries.*.detail' => ['nullable', 'string', 'max:100'],
            'entries.*.deleted' => ['nullable', 'boolean'],
        ]);

        $user = $request->user();
        $rev = now()->getTimestampMs();

        foreach ($data['entries'] as $e) {
            $existing = Entry::where('id', $e['id'])->first();
            if ($existing && $existing->household_id !== $user->household_id) {
                continue; // id collision across households — ignore
            }
            Entry::updateOrCreate(
                ['id' => $e['id']],
                [
                    'household_id' => $user->household_id,
                    'user_id' => $existing->user_id ?? $user->id,
                    'type' => $e['type'],
                    't' => $e['t'],
                    'detail' => isset($e['detail']) ? (string) $e['detail'] : null,
                    'deleted' => (bool) ($e['deleted'] ?? false),
                    'rev' => $rev++,
                ],
            );
        }

        HouseholdTouched::send($user->household_id, 'entries');

        return response()->json(['ok' => true, 'serverTime' => now()->getTimestampMs()]);
    }
}
