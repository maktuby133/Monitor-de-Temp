export class MQTTService {
  constructor() {
    this.client = null;
    this.cfg = { broker:'', port:8884, user:'', pass:'' };
    this.rooms = [];
    this.onMessage = null;
    this.onConnect = null;
    this.onError = null;
  }
  loadSession() {
    const saved = sessionStorage.getItem('amb_mqtt_cfg');
    if(saved) try { this.cfg = {...this.cfg, ...JSON.parse(saved)}; } catch(e){}
  }
  saveSession(broker, port, user, pass) {
    this.cfg = {broker, port, user, pass};
    sessionStorage.setItem('amb_mqtt_cfg', JSON.stringify({broker, port, user, pass}));
  }
  connect() {
    if(!this.cfg.broker) return this.onError?.('Broker não configurado');
    const url = `wss://${this.cfg.broker}:${this.cfg.port}/mqtt`;
    this.client = mqtt.connect(url, {
      username: this.cfg.user,
      password: this.cfg.pass,
      reconnectPeriod: 5000,
      connectTimeout: 10000
    });
    this.client.on('connect', () => {
      this.onConnect?.();
      this.rooms.forEach(r => this.subscribeRoom(r.deviceId));
    });
    this.client.on('message', (t,p) => this.onMessage?.(t,p.toString()));
    this.client.on('error', e => this.onError?.(e.message));
  }
  subscribeRoom(deviceId) {
    if(!this.client) return;
    ['temperature','gas','relay/state'].forEach(s => {
      this.client.subscribe(`ambientwatch/${deviceId}/${s}`, {qos:0});
    });
  }
  publishRelay(deviceId, state) {
    this.client?.publish(`ambientwatch/${deviceId}/relay/set`, state, {qos:1, retain:false});
  }
  disconnect() {
    this.client?.end(true);
    this.client = null;
  }
}
