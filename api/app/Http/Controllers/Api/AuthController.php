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
            'password' => ['required', 'string', 'min:6'],
        ]);

        // an invite to this email drops the new user into their partner's household
        $invited = Household::where('invite_email', $data['email'])->first();
        $household = $invited ?? Household::create();
        if ($invited) {
            $invited->update(['invite_email' => null]);
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
            broadcast(new HouseholdTouched($household->id, 'partner'));
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

        $user = User::where('email', $data['email'])->first();
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
