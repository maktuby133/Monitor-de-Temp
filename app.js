import { MQTTService } from './mqtt-service.js';

class AmbientApp {
  constructor() {
    this.mqtt = new MQTTService();
    this.rooms = JSON.parse(localStorage.getItem('amb_rooms') || '[]');
    this.rooms.forEach(r => {
      r.gasHistory = r.gasHistory || [];
      r.tempHistory = r.tempHistory || [];
      r.relayHistory = r.relayHistory || []; // novo: histórico do relé
      if(r.relayState===undefined) r.relayState=false;
      if(!r.gasThreshold) r.gasThreshold=400;
      if(!r.relayLabel) r.relayLabel='Lâmpada';
    });
    this.init();
  }
  
  init() {
    this.mqtt.rooms = this.rooms;
    this.mqtt.onMessage = (t,p) => this.handleMQTT(t,p);
    this.mqtt.onConnect = () => this.toast('MQTT conectado','ok');
    this.mqtt.onError = e => this.toast(e,'err');
    this.mqtt.loadSession();
    if(this.mqtt.cfg.broker) this.mqtt.connect();
    this.render();
  }
  
  handleMQTT(topic, payload) {
    const [,deviceId,type,sub] = topic.split('/');
    const room = this.rooms.find(r => r.deviceId === deviceId);
    if(!room) return;
    try {
      if(type === 'temperature') {
        const val = parseFloat(payload);
        room.temp = val;
        room.tempHistory.push({t:Date.now(), v:val});
        if(room.tempHistory.length>288) room.tempHistory.shift();
        this.updateChart(room, 'temp');
      }
      if(type === 'gas') {
        const val = parseFloat(payload);
        room.gas = val;
        room.gasHistory.push({t:Date.now(), v:val});
        if(room.gasHistory.length>288) room.gasHistory.shift();
        this.updateChart(room, 'gas');
        if(val > room.gasThreshold) this.notifyGas(room);
      }
      if(type === 'relay' && sub==='state') {
        const state = payload==='ON'||payload==='1';
        room.relayState = state;
        room.relayHistory.push({t:Date.now(), v:state?1:0}); // 1=ON, 0=OFF
        if(room.relayHistory.length>288) room.relayHistory.shift();
        this.updateRelayUI(room);
        this.updateChart(room, 'relay'); // gráfico de liga/desliga
      }
      room.lastSeen = Date.now();
      this.saveRooms();
      this.updateRoomCard(room);
    } catch(e){}
  }
  
  toggleRelay(room) {
    this.requirePass(room, () => {
      const newState = room.relayState ? 'OFF' : 'ON';
      this.mqtt.publishRelay(room.deviceId, newState);
      this.toast(`Comando ${newState} enviado`,'info');
    });
  }
  
  updateChart(room, type) {
    const chart = room[`${type}Chart`];
    if(!chart) return;
    const hist = room[`${type}History`];
    chart.data.labels = hist.map(p => new Date(p.t).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}));
    chart.data.datasets[0].data = hist.map(p => p.v);
    chart.update('none');
  }
  
  notifyGas(room) {
    if(Notification.permission==='granted') {
      new Notification(`⚠️ Gás em ${room.label}`, {body:`${room.gas} ppm`});
    }
  }
  
  saveRooms() { localStorage.setItem('amb_rooms', JSON.stringify(this.rooms)); }
  toast(msg,type='info'){ const w=document.getElementById('toastWrap'); if(!w)return; const t=document.createElement('div'); t.className=`toast ${type}`; t.textContent=msg; w.appendChild(t); setTimeout(()=>t.remove(),3500); }
  requirePass(r,cb){ cb(); } // adicionar modal real depois
  render(){ /* montar DOM dos cards aqui */ }
  updateRoomCard(){}
  updateRelayUI(r){ document.querySelector(`#relay-${r.id} input`).checked = r.relayState; }
}

window.addEventListener('DOMContentLoaded', () => window.app = new AmbientApp());
