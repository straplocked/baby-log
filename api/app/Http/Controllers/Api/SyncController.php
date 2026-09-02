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
            'baby' => $household->baby ? ['name' => $household->baby->name, 'age' => $household->baby->age_label] : null,
            'onDutyUserId' => $household->on_duty_user_id,
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
        ]);

        $household = $request->user()->household;
        $household->baby()->updateOrCreate(
            ['household_id' => $household->id],
            ['name' => $data['name'], 'age_label' => $data['age'] ?? null],
        );

        broadcast(new HouseholdTouched($household->id, 'baby'))->toOthers();

        return response()->json(['ok' => true]);
    }

    public function invite(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:255']]);

        $request->user()->household->update(['invite_email' => strtolower($data['email'])]);

        broadcast(new HouseholdTouched($request->user()->household_id, 'invite'))->toOthers();

        return response()->json(['ok' => true]);
    }

    /** Batch upsert from the client outbox. Client ids win; latest write wins. */
    public function pushEntries(Request $request): JsonResponse
    {
        $data = $request->validate([
            'entries' => ['required', 'array', 'max:500'],
            'entries.*.id' => ['required', 'string', 'max:64'],
            'entries.*.type' => ['required', 'string', 'max:20'],
            'entries.*.t' => ['required', 'integer'],
            'entries.*.detail' => ['nullable'],
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

        broadcast(new HouseholdTouched($user->household_id, 'entries'))->toOthers();

        return response()->json(['ok' => true, 'serverTime' => now()->getTimestampMs()]);
    }
}
