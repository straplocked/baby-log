<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // 'parent' (full control) | 'caregiver' (logs, timers, shifts only).
            // Default covers every pre-roles account: they were all parents.
            $table->string('role')->default('parent');
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('role'));
    }
};
