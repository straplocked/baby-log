<?php

namespace App\Contracts;

interface MqttConnectionFactory
{
    /**
     * @param  array{host: string, port: int, username?: ?string, password?: ?string,
     *               tls?: bool, tls_verify?: bool}  $config
     * @param  string  $clientId  unique per connection role (publisher vs listener)
     */
    public function make(array $config, string $clientId): MqttConnection;
}
