<?php

namespace App\Http\Controllers\Api;

use App\Events\HouseholdTouched;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\PushService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShiftController extends Controller
{
    /**
     * Handoff pushes deliberately ignore quiet hours — this is one parent
     * addressing the other directly, not the app nagging.
     */
    private function pushHandoff(?User $to, string $title, string $body): void
    {
        if ($to && $to->notifyPrefs()['handoff']) {
            app(PushService::class)->notify($to, 'shift', $title, $body);
        }
    }

    /** On-duty parent asks the partner to take over ("Hand off"). */
    public function request(Request $request): JsonResponse
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);
        $household = $request->user()->household;

        $pending = $household->shifts()->where('state', 'requested')->first();
        if (! $pending) {
            $household->shifts()->create([
                'state' => 'requested',
                'requester_id' => $request->user()->id,
                'note' => $data['note'] ?? null,
                'requested_at' => now()->getTimestampMs(),
            ]);
            $this->pushHandoff(
                $household->partnerOf($request->user()),
                $request->user()->name.' is asking you to take over',
                ($data['note'] ?? null) ?: 'Open Baby Log to see the handoff.',
            );
        }

        HouseholdTouched::send($household->id, 'shift');

        return response()->json(['ok' => true]);
    }

    /** "I've got him" — start my shift (accepts a pending request if one exists). */
    public function accept(Request $request): JsonResponse
    {
        $data = $request->validate([
            'plan' => ['nullable', 'array', 'max:20'],
            'plan.*.id' => ['required', 'string', 'max:40'],
            'plan.*.type' => ['required', 'string', 'max:20'],
            'plan.*.at' => ['required', 'integer'],
            'until' => ['nullable', 'string', 'max:60'],
        ]);

        $user = $request->user();
        $household = $user->household;

        $shift = $household->shifts()->where('state', 'requested')->latest('id')->first()
            ?? $household->shifts()->make(['requested_at' => null]);

        $shift->fill([
            'household_id' => $household->id,
            'state' => 'active',
            'user_id' => $user->id,
            'plan' => $data['plan'] ?? [],
            'until' => $data['until'] ?? null,
            'started_at' => now()->getTimestampMs(),
        ])->save();

        $household->update(['on_duty_user_id' => $user->id]);

        HouseholdTouched::send($household->id, 'shift');
        $until = ($data['until'] ?? null) ?: null;
        $this->pushHandoff(
            $household->partnerOf($user),
            $user->name.' took over — you’re covered',
            $until ? 'On duty '.lcfirst($until).'.' : 'Get some rest.',
        );

        return response()->json(['ok' => true, 'shift' => $shift]);
    }

    /** Replace the plan on my active shift (e.g. "Add to plan"). */
    public function plan(Request $request): JsonResponse
    {
        $data = $request->validate([
            'plan' => ['present', 'array', 'max:20'],
            'plan.*.id' => ['required', 'string', 'max:40'],
            'plan.*.type' => ['required', 'string', 'max:20'],
            'plan.*.at' => ['required', 'integer'],
        ]);

        $user = $request->user();
        $shift = $user->household->shifts()->where('state', 'active')->where('user_id', $user->id)->latest('id')->first();
        $shift?->update(['plan' => $data['plan']]);

        HouseholdTouched::send($user->household_id, 'shift');

        return response()->json(['ok' => true]);
    }

    /** End my shift and put the partner back on duty, with a note + report window. */
    public function handback(Request $request): JsonResponse
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);

        $user = $request->user();
        $household = $user->household;
        $partner = $household->partnerOf($user);

        $shift = $household->shifts()->where('state', 'active')->where('user_id', $user->id)->latest('id')->first();
        if ($shift) {
            $shift->update([
                'state' => 'completed',
                'ended_at' => now()->getTimestampMs(),
                'handback_note' => $data['note'] ?? null,
            ]);
        }

        $household->update(['on_duty_user_id' => $partner?->id ?? $user->id]);

        HouseholdTouched::send($household->id, 'shift');
        $this->pushHandoff(
            $partner,
            $user->name.' handed '.($household->baby?->name ?? 'the baby').' back',
            ($data['note'] ?? null) ?: 'Their shift report is waiting in the app.',
        );

        return response()->json(['ok' => true, 'shift' => $shift]);
    }
}
