<?php

namespace Tests\Feature;

use App\Models\Household;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * Sanctum's expiration counts from token creation; the AppServiceProvider
 * callback slides it to count from last use, so a phone in regular use never
 * re-sees the login screen while an idle device still ages out.
 */
class TokenExpiryTest extends TestCase
{
    use RefreshDatabase;

    /** A signed-in user whose token was created $createdDaysAgo, last used $usedDaysAgo. */
    private function agedToken(int $createdDaysAgo, ?int $usedDaysAgo): string
    {
        $household = Household::create();
        $user = User::create([
            'name' => 'Ben', 'email' => 'ben@example.com', 'password' => 'password123',
            'household_id' => $household->id, 'role' => 'parent',
        ]);
        $plain = $user->createToken('app')->plainTextToken;
        PersonalAccessToken::query()->update([
            'created_at' => now()->subDays($createdDaysAgo),
            'last_used_at' => $usedDaysAgo === null ? null : now()->subDays($usedDaysAgo),
        ]);

        return $plain;
    }

    public function test_an_actively_used_token_outlives_the_created_at_window(): void
    {
        $token = $this->agedToken(createdDaysAgo: 120, usedDaysAgo: 1);

        $this->getJson('/api/state?since=0', ['Authorization' => 'Bearer '.$token])->assertOk();
    }

    public function test_a_token_idle_past_the_window_expires(): void
    {
        $token = $this->agedToken(createdDaysAgo: 120, usedDaysAgo: 95);

        $this->getJson('/api/state?since=0', ['Authorization' => 'Bearer '.$token])->assertUnauthorized();
    }

    public function test_an_old_never_used_token_expires(): void
    {
        $token = $this->agedToken(createdDaysAgo: 120, usedDaysAgo: null);

        $this->getJson('/api/state?since=0', ['Authorization' => 'Bearer '.$token])->assertUnauthorized();
    }

    public function test_a_fresh_token_works_as_before(): void
    {
        $token = $this->agedToken(createdDaysAgo: 0, usedDaysAgo: null);

        $this->getJson('/api/state?since=0', ['Authorization' => 'Bearer '.$token])->assertOk();
    }
}
