<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BabylogApiTest extends TestCase
{
    use RefreshDatabase;

    private function register(string $name, string $email, string $password = 'password123')
    {
        return $this->postJson('/api/register', ['name' => $name, 'email' => $email, 'password' => $password]);
    }

    private function authed(string $token): array
    {
        // guards cache the resolved user across requests within one test —
        // reset so each request authenticates as its own token's user
        $this->app['auth']->forgetGuards();

        return ['Authorization' => 'Bearer '.$token];
    }

    // ── registration lockdown ─────────────────────────────────────────────────

    public function test_first_account_can_register(): void
    {
        $this->register('Ben', 'ben@example.com')->assertCreated()->assertJsonStructure(['token']);
    }

    public function test_second_uninvited_registration_is_blocked(): void
    {
        $this->register('Ben', 'ben@example.com')->assertCreated();
        $this->register('Mallory', 'mallory@example.com')->assertStatus(422);
        $this->assertSame(1, User::count());
    }

    public function test_invited_email_joins_the_household_with_code(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $code = $this->postJson('/api/invite', ['email' => 'Katrina@Example.com'], $this->authed($ben))
            ->assertOk()->json('code');
        $this->assertNotEmpty($code);

        // invited email without (or with a wrong) code is rejected — no hijack
        $this->register('Katrina', 'katrina@example.com')->assertStatus(422);
        $this->postJson('/api/register', ['name' => 'Mallory', 'email' => 'katrina@example.com', 'password' => 'password123', 'invite' => 'WRONG1'])->assertStatus(422);

        $res = $this->postJson('/api/register', ['name' => 'Katrina', 'email' => 'katrina@example.com', 'password' => 'password123', 'invite' => $code]);
        $res->assertCreated();
        $this->assertTrue($res->json('joinedPartner'));
        $this->assertSame(User::first()->household_id, User::orderByDesc('id')->first()->household_id);
    }

    public function test_full_household_cannot_invite_a_third(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $code = $this->postJson('/api/invite', ['email' => 'katrina@example.com'], $this->authed($ben))->json('code');
        $this->postJson('/api/register', ['name' => 'Katrina', 'email' => 'katrina@example.com', 'password' => 'password123', 'invite' => $code])->assertCreated();

        $this->postJson('/api/invite', ['email' => 'third@example.com'], $this->authed($ben))->assertStatus(422);
    }

    public function test_short_passwords_are_rejected(): void
    {
        $this->register('Ben', 'ben@example.com', 'short')->assertStatus(422);
    }

    public function test_login_rejects_wrong_password(): void
    {
        $this->register('Ben', 'ben@example.com');
        $this->postJson('/api/login', ['email' => 'ben@example.com', 'password' => 'wrong-password'])->assertStatus(422);
        $this->postJson('/api/login', ['email' => 'ben@example.com', 'password' => 'password123'])->assertOk();
    }

    // ── household scoping ─────────────────────────────────────────────────────

    public function test_entries_are_scoped_to_the_household(): void
    {
        config(['babylog.open_registration' => true]);
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $eve = $this->register('Eve', 'eve@example.com')->json('token');

        $this->postJson('/api/entries', ['entries' => [
            ['id' => 'e1', 'type' => 'bottle', 't' => 1000, 'detail' => '4'],
        ]], $this->authed($ben))->assertOk();

        $this->assertCount(0, $this->getJson('/api/state?since=0', $this->authed($eve))->json('entries'));
        $this->assertCount(1, $this->getJson('/api/state?since=0', $this->authed($ben))->json('entries'));

        // Eve cannot hijack Ben's entry id into her household
        $this->postJson('/api/entries', ['entries' => [
            ['id' => 'e1', 'type' => 'meds', 't' => 2000],
        ]], $this->authed($eve))->assertOk();
        $entry = $this->getJson('/api/state?since=0', $this->authed($ben))->json('entries.0');
        $this->assertSame('bottle', $entry['type']);
    }

    public function test_deletes_sync_as_tombstones(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $this->postJson('/api/entries', ['entries' => [
            ['id' => 'e1', 'type' => 'bottle', 't' => 1000, 'detail' => '4'],
        ]], $this->authed($ben));
        $this->postJson('/api/entries', ['entries' => [
            ['id' => 'e1', 'type' => 'bottle', 't' => 1000, 'detail' => '4', 'deleted' => true],
        ]], $this->authed($ben));

        $entries = $this->getJson('/api/state?since=0', $this->authed($ben))->json('entries');
        $this->assertCount(1, $entries);
        $this->assertTrue((bool) $entries[0]['deleted']);
    }

    // ── shifts ────────────────────────────────────────────────────────────────

    public function test_full_shift_cycle_transfers_duty(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $code = $this->postJson('/api/invite', ['email' => 'katrina@example.com'], $this->authed($ben))->json('code');
        $kat = $this->postJson('/api/register', ['name' => 'Katrina', 'email' => 'katrina@example.com', 'password' => 'password123', 'invite' => $code])->json('token');

        $benId = $this->getJson('/api/state', $this->authed($ben))->json('user.id');
        $katId = $this->getJson('/api/state', $this->authed($kat))->json('user.id');

        // Ben (first user) starts on duty and asks Katrina to take over
        $this->assertSame($benId, $this->getJson('/api/state', $this->authed($ben))->json('onDutyUserId'));
        $this->postJson('/api/shifts/request', ['note' => 'need sleep'], $this->authed($ben))->assertOk();
        $this->assertSame('requested', $this->getJson('/api/state', $this->authed($kat))->json('shift.state'));

        $this->postJson('/api/shifts/accept', ['plan' => [], 'until' => 'Open-ended'], $this->authed($kat))->assertOk();
        $this->assertSame($katId, $this->getJson('/api/state', $this->authed($ben))->json('onDutyUserId'));

        $this->postJson('/api/shifts/handback', ['note' => 'went fine'], $this->authed($kat))->assertOk();
        $state = $this->getJson('/api/state', $this->authed($ben))->json();
        $this->assertSame($benId, $state['onDutyUserId']);
        $this->assertSame('completed', $state['shift']['state']);
        $this->assertSame('went fine', $state['shift']['handback_note']);
    }

    public function test_state_requires_auth(): void
    {
        $this->getJson('/api/state')->assertStatus(401);
    }
}
