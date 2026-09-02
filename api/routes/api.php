<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ShiftController;
use App\Http\Controllers\Api\SyncController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:10,1');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

Route::middleware(['auth:sanctum', 'throttle:120,1'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/state', [SyncController::class, 'state']);
    Route::post('/baby', [SyncController::class, 'setBaby']);
    Route::post('/invite', [SyncController::class, 'invite']);
    Route::post('/settings', [SyncController::class, 'setSettings']);
    Route::post('/entries', [SyncController::class, 'pushEntries']);

    Route::post('/shifts/request', [ShiftController::class, 'request']);
    Route::post('/shifts/accept', [ShiftController::class, 'accept']);
    Route::post('/shifts/plan', [ShiftController::class, 'plan']);
    Route::post('/shifts/handback', [ShiftController::class, 'handback']);
});
