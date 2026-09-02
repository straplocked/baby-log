<?php

namespace App\Http\Controllers\Api;

use App\Events\HouseholdTouched;
use App\Http\Controllers\Controller;
use App\Models\Household;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'invite' => ['nullable', 'string', 'max:20'],
        ]);
        $data['email'] = strtolower($data['email']);

        // an invite to this email drops the new user into their partner's household —
        // but only with the single-use code the inviter was shown
        $invited = Household::where('invite_email', $data['email'])->first();

        // invite-only by default: first account or invited emails, nothing else
        if (! $invited && ! config('babylog.open_registration') && User::count() > 0) {
            throw ValidationException::withMessages([
                'email' => ['This Baby Log is invite-only. Ask your partner to invite this exact email.'],
            ]);
        }
        if ($invited) {
            $code = strtoupper(preg_replace('/[^a-z0-9]/i', '', (string) ($data['invite'] ?? '')));
            if ($code === '' || ! hash_equals((string) $invited->invite_code_hash, hash('sha256', $code))) {
                throw ValidationException::withMessages([
                    'invite' => ['Check the invite code your partner was shown when they invited you.'],
                ]);
            }
            if ($invited->users()->count() >= config('babylog.max_household_users')) {
                throw ValidationException::withMessages([
                    'email' => ['That log already has both grown-ups.'],
                ]);
            }
        }

        $household = $invited ?? Household::create();
        if ($invited) {
            $invited->update(['invite_email' => null, 'invite_code_hash' => null]);
        }

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'household_id' => $household->id,
        ]);

        if (! $household->on_duty_user_id) {
            $household->update(['on_duty_user_id' => $user->id]);
        }

        if ($invited) {
            HouseholdTouched::send($household->id, 'partner', toOthers: false);
        }

        return response()->json([
            'token' => $user->createToken('app')->plainTextToken,
            'joinedPartner' => (bool) $invited,
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', strtolower($data['email']))->first();
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => ['These details don’t match a log we know.']]);
        }

        return response()->json(['token' => $user->createToken('app')->plainTextToken]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['ok' => true]);
    }
}
