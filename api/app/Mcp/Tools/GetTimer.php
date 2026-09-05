<?php

namespace App\Mcp\Tools;

use Illuminate\Support\Carbon;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[IsReadOnly]
#[Description('The household\'s running timer (nursing, pumping, or sleep), or null if none.')]
class GetTimer extends BabylogTool
{
    public function handle(Request $request): Response
    {
        if ($denied = $this->requireAbilities($request, 'timer:read')) {
            return $denied;
        }

        $user = $this->user($request);
        $timer = $user->household->active_timer;

        return Response::json([
            'timer' => $timer ? array_merge($timer, [
                'started' => Carbon::createFromTimestampMs($timer['started_at'])->toIso8601String(),
                'elapsed_minutes' => (int) floor((now()->getTimestampMs() - $timer['started_at']) / 60000),
                'by' => $this->memberNames($user)[$timer['user_id']] ?? null,
            ]) : null,
        ]);
    }
}
