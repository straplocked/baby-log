<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('babies', function (Blueprint $table) {
            // archived children keep their entries but leave the pickers
            $table->boolean('archived')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('babies', fn (Blueprint $table) => $table->dropColumn('archived'));
    }
};
