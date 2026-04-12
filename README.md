ESP32 DHT11 Temperature Monitor
Esquema de ligação
```
ESP32          DHT11
─────────────────────
3.3V    →  VCC (pino 1)
GND     →  GND (pino 4)
GPIO 4  →  DATA (pino 2)  + resistor pull-up 10kΩ entre DATA e VCC

Botão AP:
GPIO 0 (BOOT) → GND  (pull-up interno ativado no código)
LED feedback:
GPIO 2 (LED onboard) — acende quando AP está ativo
```
Bibliotecas necessárias (Arduino IDE)
Biblioteca	Instalar via...
DHT sensor library	Library Manager (Adafruit)
Adafruit Unified Sensor	Library Manager
PubSubClient	Library Manager
ArduinoJson	Library Manager (v6)
EEPROM	Built-in
Configuração antes de gravar
No arquivo `.ino`, edite as constantes:
```cpp
#define MQTT_BROKER  "SEU_BROKER.hivemq.cloud"
#define MQTT_PORT    8883
#define MQTT_USER    "seu-usuario"
#define MQTT_PASS    "sua-senha"
```
Como usar
1ª vez (sem configuração salva)
Grave o firmware no ESP32.
O ESP32 entrará automaticamente em modo AP.
Conecte seu celular na rede `ESP32-TempMonitor` (senha: `12345678`).
Acesse `http://192.168.4.1` no navegador.
Preencha SSID, senha do Wi-Fi, ID e nome do ambiente.
Clique em Salvar — o AP fecha e o ESP32 reinicia conectado.
Reconfigurar (modo AP manual)
Segure o botão no GPIO 0 durante 2 segundos ao ligar.
Ou pressione o botão a qualquer momento durante operação normal.
O AP fica disponível por 5 minutos e fecha automaticamente.
Tópico MQTT publicado
```
sensors/<device_id>/data
```
Payload JSON:
```json
{
  "device_id":    "sala",
  "label":        "Sala de Estar",
  "temperature":  27.3,
  "humidity":     58.5,
  "timestamp":    123456789
}
```
Dashboard
Abra `dashboard/index.html` em qualquer navegador.
Clique em MQTT → preencha as credenciais do HiveMQ Cloud.
Clique em Conectar.
Clique em + Ambiente → informe o mesmo ID usado no firmware.
Os dados aparecerão em tempo real assim que o ESP32 publicar.
O dashboard salva configurações e ambientes no `localStorage` do navegador.
HiveMQ Cloud (gratuito)
Crie conta em https://console.hivemq.cloud
Crie um cluster gratuito.
Vá em Access Management → crie um usuário/senha.
Use o host do cluster como `MQTT_BROKER` (porta TLS WebSocket: 8884 para o dashboard, 8883 para o ESP32).
