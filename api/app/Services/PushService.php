<?php

namespace App\Services;

use App\Models\User;
use GuzzleHttp\Client;
use Illuminate\Support\Facades\DB;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\VAPID;
use Minishlink\WebPush\WebPush;

/**
 * Web Push transport. Like HouseholdTouched, delivery is best-effort — a dead
 * push service must never fail the write (or the scheduler tick) that asked
 * for it. Whether a notification *should* go out is the caller's job; this
 * class only ships it to every device the user opted in.
 */
class PushService
{
    private ?WebPush $client = null;

    private ?array $keys = null;

    public function notify(User $user, string $tag, string $title, string $body): void
    {
        try {
            $subs = $user->pushSubscriptions;
            if ($subs->isEmpty()) {
                return;
            }
            $payload = json_encode(['title' => $title, 'body' => $body, 'tag' => $tag]);
            foreach ($subs as $sub) {
                $report = $this->client()->sendOneNotification(
                    Subscription::create([
                        'endpoint' => $sub->endpoint,
                        'publicKey' => $sub->p256dh,
                        'authToken' => $sub->auth,
                    ]),
                    $payload,
                    ['TTL' => 12 * 3600, 'urgency' => 'high'],
                );
                if ($report->isSubscriptionExpired()) {
                    $sub->delete(); // browser dropped the subscription — stop pushing at it
                }
            }
        } catch (\Throwable) {
            // no push today — the app still converges through its normal sync
        }
    }

    /** The VAPID public key the client needs to subscribe. */
    public function publicKey(): string
    {
        return $this->keys()['publicKey'];
    }

    /**
     * Env override first (hosted / advanced setups), otherwise a keypair
     * generated once into SQLite so self-hosted instances need zero config.
     */
    private function keys(): array
    {
        if ($this->keys) {
            return $this->keys;
        }
        if (config('babylog.vapid_public') && config('babylog.vapid_private')) {
            return $this->keys = [
                'publicKey' => config('babylog.vapid_public'),
                'privateKey' => config('babylog.vapid_private'),
            ];
        }
        $row = DB::table('vapid_keys')->first();
        if (! $row) {
            $created = VAPID::createVapidKeys();
            DB::table('vapid_keys')->insert([
                'public_key' => $created['publicKey'],
                'private_key' => $created['privateKey'],
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $row = DB::table('vapid_keys')->first();
        }

        return $this->keys = ['publicKey' => $row->public_key, 'privateKey' => $row->private_key];
    }

    private function client(): WebPush
    {
        return $this->client ??= new WebPush(
            ['VAPID' => [
                'subject' => config('app.url') ?: 'mailto:babylog@localhost',
                'publicKey' => $this->keys()['publicKey'],
                'privateKey' => $this->keys()['privateKey'],
            ]],
            [],
            new Client(['timeout' => 10]),
        );
    }
}
