<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Baby extends Model
{
    protected $fillable = ['household_id', 'name', 'age_label', 'birthdate'];
}
