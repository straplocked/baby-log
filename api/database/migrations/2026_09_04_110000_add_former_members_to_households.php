<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('households', function (Blueprint $table) {
            // who used to be here: [{id, name}] snapshots taken at remove-member
            // time so entry attribution survives the user row being deleted
            $table->json('former_members')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('households', function (Blueprint $table) {
            $table->dropColumn('former_members');
        });
    }
};
