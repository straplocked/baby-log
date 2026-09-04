<?php

namespace Tests\Feature;

use App\Mail\PartnerInvite;
use App\Mail\PasswordResetLink;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
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

    // ── baby ──────────────────────────────────────────────────────────────────

    public function test_baby_birthdate_round_trips_and_survives_omission(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');

        $this->postJson('/api/baby', ['name' => 'Maddux', 'birthdate' => '2026-07-20'], $this->authed($ben))->assertOk();
        $baby = $this->getJson('/api/state', $this->authed($ben))->json('baby');
        $this->assertSame('2026-07-20', $baby['birthdate']);

        // a rename without a birthdate key must not erase the stored DOB
        $this->postJson('/api/baby', ['name' => 'Maddux Jr'], $this->authed($ben))->assertOk();
        $baby = $this->getJson('/api/state', $this->authed($ben))->json('baby');
        $this->assertSame('Maddux Jr', $baby['name']);
        $this->assertSame('2026-07-20', $baby['birthdate']);

        // future and garbage dates are rejected
        $this->postJson('/api/baby', ['name' => 'Maddux', 'birthdate' => now()->addDay()->format('Y-m-d')], $this->authed($ben))->assertStatus(422);
        $this->postJson('/api/baby', ['name' => 'Maddux', 'birthdate' => 'not-a-date'], $this->authed($ben))->assertStatus(422);
    }

    // ── household settings ────────────────────────────────────────────────────

    public function test_settings_sync_to_the_partner(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $code = $this->postJson('/api/invite', ['email' => 'katrina@example.com'], $this->authed($ben))->json('code');
        $kat = $this->postJson('/api/register', ['name' => 'Katrina', 'email' => 'katrina@example.com', 'password' => 'password123', 'invite' => $code])->json('token');

        $this->assertNull($this->getJson('/api/state', $this->authed($ben))->json('settings'));

        $this->postJson('/api/settings', ['tracking' => ['diapers' => false], 'dismissed' => ['meds']], $this->authed($ben))->assertOk();

        $settings = $this->getJson('/api/state', $this->authed($kat))->json('settings');
        $this->assertFalse($settings['tracking']['diapers']);
        $this->assertSame(['meds'], $settings['dismissed']);
    }

    public function test_settings_drop_unknown_tracker_keys(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $this->postJson('/api/settings', ['tracking' => ['diapers' => false, 'feeds' => false], 'dismissed' => ['nonsense']], $this->authed($ben))->assertOk();

        $settings = $this->getJson('/api/state', $this->authed($ben))->json('settings');
        $this->assertSame(['diapers' => false], $settings['tracking']);
        $this->assertSame([], $settings['dismissed']);
    }

    public function test_now_screen_widgets_round_trip_ordered_and_filtered(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');

        // client order is preserved; unknowns and duplicates are dropped
        $this->postJson('/api/settings', ['widgets' => ['pump', 'feeds', 'nope', 'pump']], $this->authed($ben))->assertOk();

        $settings = $this->getJson('/api/state', $this->authed($ben))->json('settings');
        $this->assertSame(['pump', 'feeds'], $settings['widgets']);
    }

    public function test_theme_round_trips_and_rejects_unknown_presets(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');

        $this->postJson('/api/settings', ['theme' => ['accent' => 'clay', 'bg' => 'mist']], $this->authed($ben))->assertOk();
        $this->assertSame(['accent' => 'clay', 'bg' => 'mist'], $this->getJson('/api/state', $this->authed($ben))->json('settings.theme'));

        // only known preset keys — a free-form hex would bypass the palette
        $this->postJson('/api/settings', ['theme' => ['accent' => '#FF0000']], $this->authed($ben))->assertStatus(422);
        $this->postJson('/api/settings', ['theme' => ['bg' => 'vantablack']], $this->authed($ben))->assertStatus(422);

        // a client that predates themes syncs settings without the key — theme survives
        $this->postJson('/api/settings', ['tracking' => ['bath' => false]], $this->authed($ben))->assertOk();
        $this->assertSame('clay', $this->getJson('/api/state', $this->authed($ben))->json('settings.theme.accent'));
    }

    public function test_settings_are_scoped_to_the_household(): void
    {
        config(['babylog.open_registration' => true]);
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $eve = $this->register('Eve', 'eve@example.com')->json('token');

        $this->postJson('/api/settings', ['tracking' => ['bath' => false]], $this->authed($ben))->assertOk();
        $this->assertNull($this->getJson('/api/state', $this->authed($eve))->json('settings'));
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

    // ── timers ────────────────────────────────────────────────────────────────

    public function test_timer_start_and_stop_sync_to_the_household(): void
    {
        config(['babylog.open_registration' => true]);
        $ben = $this->register('Ben', 'ben@example.com')->json('token');

        $this->assertNull($this->getJson('/api/state', $this->authed($ben))->json('timer'));

        $timer = $this->postJson('/api/timer/start', ['type' => 'nurse'], $this->authed($ben))->assertOk()->json('timer');
        $this->assertSame('nurse', $timer['type']);
        $this->assertNotEmpty($timer['started_at']);

        $synced = $this->getJson('/api/state', $this->authed($ben))->json('timer');
        $this->assertSame('nurse', $synced['type']);

        $this->postJson('/api/timer/stop', [], $this->authed($ben))->assertOk();
        $this->assertNull($this->getJson('/api/state', $this->authed($ben))->json('timer'));
    }

    public function test_timer_rejects_unknown_type(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $this->postJson('/api/timer/start', ['type' => 'bottle'], $this->authed($ben))->assertStatus(422);
    }

    public function test_sleep_timer_syncs_to_the_partner_and_clears_on_stop(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $code = $this->postJson('/api/invite', ['email' => 'katrina@example.com'], $this->authed($ben))->json('code');
        $kat = $this->postJson('/api/register', ['name' => 'Katrina', 'email' => 'katrina@example.com', 'password' => 'password123', 'invite' => $code])->json('token');

        $timer = $this->postJson('/api/timer/start', ['type' => 'sleep'], $this->authed($ben))->assertOk()->json('timer');
        $this->assertSame('sleep', $timer['type']);

        // the other parent's pull sees the same running timer
        $synced = $this->getJson('/api/state', $this->authed($kat))->json('timer');
        $this->assertSame('sleep', $synced['type']);
        $this->assertSame($timer['id'], $synced['id']);

        $this->postJson('/api/timer/stop', [], $this->authed($ben))->assertOk();
        $this->assertNull($this->getJson('/api/state', $this->authed($kat))->json('timer'));
    }

    // ── shift edge cases ─────────────────────────────────────────────────────

    public function test_accept_tolerates_fractional_plan_timestamps(): void
    {
        // the client derives plan times from an averaged feed gap — a float.
        // this used to 422 the whole handoff and the UI swallowed it as "offline"
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $code = $this->postJson('/api/invite', ['email' => 'katrina@example.com'], $this->authed($ben))->json('code');
        $kat = $this->postJson('/api/register', ['name' => 'Katrina', 'email' => 'katrina@example.com', 'password' => 'password123', 'invite' => $code])->json('token');
        $katId = $this->getJson('/api/state', $this->authed($kat))->json('user.id');

        $plan = [['id' => 'p1', 'type' => 'bottle', 'at' => 1788385718169.5], ['id' => 'p2', 'type' => 'bottle', 'at' => 1788396518169.25]];
        $res = $this->postJson('/api/shifts/accept', ['plan' => $plan, 'until' => 'Until 6 AM'], $this->authed($kat))->assertOk();
        $this->assertSame(1788385718170, $res->json('shift.plan.0.at'));
        $this->assertSame($katId, $this->getJson('/api/state', $this->authed($ben))->json('onDutyUserId'));

        // plan replacement is just as forgiving
        $this->postJson('/api/shifts/plan', ['plan' => [['id' => 'p3', 'type' => 'meds', 'at' => 1788400000000.7]]], $this->authed($kat))->assertOk();
        $this->assertSame(1788400000001, $this->getJson('/api/state', $this->authed($kat))->json('shift.plan.0.at'));
    }

    public function test_handback_cancels_a_lingering_request(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $code = $this->postJson('/api/invite', ['email' => 'katrina@example.com'], $this->authed($ben))->json('code');
        $kat = $this->postJson('/api/register', ['name' => 'Katrina', 'email' => 'katrina@example.com', 'password' => 'password123', 'invite' => $code])->json('token');
        $katId = $this->getJson('/api/state', $this->authed($kat))->json('user.id');

        // Ben asks, Katrina never answers, Ben hands duty over directly anyway
        $this->postJson('/api/shifts/request', ['note' => 'take him?'], $this->authed($ben))->assertOk();
        $this->postJson('/api/shifts/handback', [], $this->authed($ben))->assertOk();

        $state = $this->getJson('/api/state', $this->authed($kat))->json();
        $this->assertSame($katId, $state['onDutyUserId']);
        // the stale ask must not survive to render a phantom "Ben is handing off" card
        $this->assertNotSame('requested', $state['shift']['state']);
    }

    // ── account (name / email / password) ─────────────────────────────────────

    public function test_profile_name_change_syncs_to_the_partner(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $code = $this->postJson('/api/invite', ['email' => 'katrina@example.com'], $this->authed($ben))->json('code');
        $kat = $this->postJson('/api/register', ['name' => 'Katrina', 'email' => 'katrina@example.com', 'password' => 'password123', 'invite' => $code])->json('token');

        $this->postJson('/api/account/profile', ['name' => 'Benjamin'], $this->authed($ben))->assertOk();

        $this->assertSame('Benjamin', $this->getJson('/api/state', $this->authed($ben))->json('user.name'));
        $this->assertSame('Benjamin', $this->getJson('/api/state', $this->authed($kat))->json('partner.name'));

        // a blank name is rejected and changes nothing
        $this->postJson('/api/account/profile', ['name' => ''], $this->authed($ben))->assertStatus(422);
        $this->assertSame('Benjamin', $this->getJson('/api/state', $this->authed($ben))->json('user.name'));
    }

    public function test_email_change_requires_the_current_password(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');

        // wrong password → rejected, address untouched
        $this->postJson('/api/account/email', ['email' => 'new@example.com', 'password' => 'wrong-password'], $this->authed($ben))->assertStatus(422);
        $this->assertSame('ben@example.com', $this->getJson('/api/state', $this->authed($ben))->json('user.email'));
        $this->postJson('/api/login', ['email' => 'ben@example.com', 'password' => 'password123'])->assertOk();

        // right password → stored lowercased, and login follows the new address
        $this->postJson('/api/account/email', ['email' => 'New.Ben@Example.com', 'password' => 'password123'], $this->authed($ben))->assertOk();
        $this->assertSame('new.ben@example.com', $this->getJson('/api/state', $this->authed($ben))->json('user.email'));
        $this->postJson('/api/login', ['email' => 'ben@example.com', 'password' => 'password123'])->assertStatus(422);
        $this->postJson('/api/login', ['email' => 'new.ben@example.com', 'password' => 'password123'])->assertOk();
    }

    public function test_email_change_rejects_a_duplicate_email(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $code = $this->postJson('/api/invite', ['email' => 'katrina@example.com'], $this->authed($ben))->json('code');
        $this->postJson('/api/register', ['name' => 'Katrina', 'email' => 'katrina@example.com', 'password' => 'password123', 'invite' => $code])->assertCreated();

        // the partner's address is taken — case games don't sneak past the check
        $this->postJson('/api/account/email', ['email' => 'Katrina@Example.com', 'password' => 'password123'], $this->authed($ben))->assertStatus(422);
        $this->assertSame('ben@example.com', $this->getJson('/api/state', $this->authed($ben))->json('user.email'));

        // re-saving your own address is not a duplicate
        $this->postJson('/api/account/email', ['email' => 'ben@example.com', 'password' => 'password123'], $this->authed($ben))->assertOk();
    }

    public function test_password_change_requires_current_and_logs_out_other_phones(): void
    {
        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $otherPhone = $this->postJson('/api/login', ['email' => 'ben@example.com', 'password' => 'password123'])->json('token');

        // wrong current password → rejected, the old password still works
        $this->postJson('/api/account/password', ['current_password' => 'wrong-password', 'password' => 'newpassword9'], $this->authed($ben))->assertStatus(422);
        $this->postJson('/api/login', ['email' => 'ben@example.com', 'password' => 'password123'])->assertOk();

        // a too-short replacement is rejected too
        $this->postJson('/api/account/password', ['current_password' => 'password123', 'password' => 'short'], $this->authed($ben))->assertStatus(422);
        $this->postJson('/api/login', ['email' => 'ben@example.com', 'password' => 'password123'])->assertOk();

        $this->postJson('/api/account/password', ['current_password' => 'password123', 'password' => 'newpassword9'], $this->authed($ben))->assertOk();

        $this->postJson('/api/login', ['email' => 'ben@example.com', 'password' => 'password123'])->assertStatus(422);
        $this->postJson('/api/login', ['email' => 'ben@example.com', 'password' => 'newpassword9'])->assertOk();

        // the session that changed the password survives; every other one is dead
        $this->getJson('/api/state', $this->authed($ben))->assertOk();
        $this->getJson('/api/state', $this->authed($otherPhone))->assertStatus(401);
    }

    // ── email flows (invite mail + password reset) ────────────────────────────

    public function test_invite_emails_the_partner_when_mail_is_configured(): void
    {
        config(['mail.default' => 'smtp']);
        Mail::fake();

        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $res = $this->postJson('/api/invite', ['email' => 'Katrina@Example.com'], $this->authed($ben))->assertOk();

        $this->assertTrue($res->json('mailed'));
        Mail::assertSent(PartnerInvite::class, fn (PartnerInvite $mail) => $mail->hasTo('katrina@example.com')
            && $mail->code === $res->json('code')
            && $mail->inviterName === 'Ben');
    }

    public function test_invite_stays_silent_without_a_mailer(): void
    {
        config(['mail.default' => 'log']);
        Mail::fake();

        $ben = $this->register('Ben', 'ben@example.com')->json('token');
        $res = $this->postJson('/api/invite', ['email' => 'katrina@example.com'], $this->authed($ben))->assertOk();

        $this->assertFalse($res->json('mailed'));
        $this->assertNotEmpty($res->json('code')); // the shareable code still works
        Mail::assertNothingSent();
    }

    public function test_forgot_password_reports_when_mail_is_unconfigured(): void
    {
        config(['mail.default' => 'log']);
        $this->register('Ben', 'ben@example.com');

        $this->postJson('/api/forgot-password', ['email' => 'ben@example.com'])
            ->assertOk()
            ->assertJson(['sent' => false, 'reason' => 'mail-unconfigured']);
    }

    public function test_forgot_password_never_reveals_whether_an_account_exists(): void
    {
        config(['mail.default' => 'smtp']);
        Mail::fake();
        $this->register('Ben', 'ben@example.com');

        $this->postJson('/api/forgot-password', ['email' => 'ben@example.com'])->assertOk()->assertJson(['sent' => true]);
        $this->postJson('/api/forgot-password', ['email' => 'stranger@example.com'])->assertOk()->assertJson(['sent' => true]);

        Mail::assertSent(PasswordResetLink::class, 1); // only the real account got mail
    }

    public function test_password_reset_round_trip_changes_the_password(): void
    {
        config(['mail.default' => 'smtp']);
        Mail::fake();
        $this->register('Ben', 'ben@example.com');

        $this->postJson('/api/forgot-password', ['email' => 'ben@example.com'])->assertOk();

        $token = null;
        Mail::assertSent(PasswordResetLink::class, function (PasswordResetLink $mail) use (&$token) {
            $token = $mail->token;

            // the link lands on the SPA, which reads ?reset & email on boot
            return str_contains($mail->url, '/?reset='.$mail->token)
                && str_contains($mail->url, 'email=ben%40example.com');
        });
        $this->assertNotNull($token);

        // a garbage token is refused and changes nothing
        $this->postJson('/api/reset-password', ['token' => 'not-the-token', 'email' => 'ben@example.com', 'password' => 'newpassword9'])->assertStatus(422);
        $this->postJson('/api/login', ['email' => 'ben@example.com', 'password' => 'password123'])->assertOk();

        $this->postJson('/api/reset-password', ['token' => $token, 'email' => 'ben@example.com', 'password' => 'newpassword9'])->assertOk();

        $this->postJson('/api/login', ['email' => 'ben@example.com', 'password' => 'password123'])->assertStatus(422);
        $this->postJson('/api/login', ['email' => 'ben@example.com', 'password' => 'newpassword9'])->assertOk();
    }
}
