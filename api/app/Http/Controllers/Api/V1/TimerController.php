<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StartTimerRequest;
use App\Services\TimerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The household's single running timer as a singleton resource: PUT starts
 * (or replaces), DELETE stops. Stopping never writes an entry — the server
 * stores facts, not in-flight guesses; log the resulting entry yourself via
 * POST /v1/entries, exactly like the app does.
 */
class TimerController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'timer' => $request->user()->household->active_timer,
            'server_time' => now()->getTimestampMs(),
        ]);
    }

    public function store(StartTimerRequest $request, TimerService $timers): JsonResponse
    {
        $data = $request->validated();
        $timer = $timers->start(
            $request->user(),
            $data['type'],
            isset($data['baby_id']) ? (int) $data['baby_id'] : null,
        );

        return response()->json(['timer' => $timer]);
    }

    public function destroy(Request $request, TimerService $timers): JsonResponse
    {
        $stopped = $timers->stop($request->user());

        return response()->json(['stopped' => $stopped]);
    }
}
