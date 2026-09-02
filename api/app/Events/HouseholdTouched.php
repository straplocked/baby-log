<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Lightweight "something changed" poke. Clients react by pulling /state,
 * so the sync path is identical whether the trigger was a socket or a poll.
 */
class HouseholdTouched implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public int $householdId, public string $kind)
    {
    }

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('household.'.$this->householdId);
    }

    public function broadcastWith(): array
    {
        return ['kind' => $this->kind];
    }
}
