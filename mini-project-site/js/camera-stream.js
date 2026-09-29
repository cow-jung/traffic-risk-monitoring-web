(function () {
  'use strict';

  var cameras = [
    { id: 'cam1', label: 'CAM 01' },
    { id: 'cam2', label: 'CAM 02' }
  ];
  var cards = {};
  var connected = new Set();
  var serverBase = location.origin;

  function updateSummary() {
    var count = document.getElementById('source-count');
    var state = document.getElementById('system-state');
    var monitor = document.getElementById('monitor-status');
    if (count) count.innerHTML = connected.size + ' <small>/ 2대</small>';
    if (state) state.textContent = connected.size === 2 ? '정상 연결' : connected.size ? '일부 연결' : '연결 대기';
    if (monitor) monitor.textContent = connected.size === 2 ? 'AI 서버 카메라 LIVE' : connected.size ? '카메라 일부 연결' : '카메라 연결 대기';
  }

  function makeCameraCard(camera) {
    var article = document.createElement('article');
    article.className = 'camera-card live-camera-card';

    var title = document.createElement('div');
    title.className = 'camera-title';
    var strong = document.createElement('strong');
    strong.textContent = camera.label;
    var status = document.createElement('span');
    status.className = 'camera-live-status';
    status.textContent = '연결 대기';
    title.append(strong, status);

    var stage = document.createElement('div');
    stage.className = 'camera-stream-stage';
    var image = document.createElement('img');
    image.className = 'camera-stream';
    image.alt = camera.label + ' 실시간 AI 분석 영상';
    image.dataset.streamSrc = serverBase + '/video_feed?cam_id=' + camera.id;
    image.hidden = true;

    var waiting = document.createElement('div');
    waiting.className = 'camera-stream-error';
    waiting.innerHTML = '<strong>카메라 연결 대기</strong><p>원격 AI 서버와 카메라 연결 상태를 확인해 주세요.</p>';

    image.addEventListener('error', function () {
      image.hidden = true;
      waiting.hidden = false;
      status.textContent = '영상 오류';
      status.classList.remove('is-live');
    });

    stage.append(image, waiting);
    article.append(title, stage);
    cards[camera.id] = { status: status, image: image, waiting: waiting };
    return article;
  }

  async function pollStatus() {
    try {
      var response = await fetch(serverBase + '/camera_status', { cache: 'no-store' });
      if (!response.ok) throw new Error('camera_status ' + response.status);
      var data = await response.json();

      cameras.forEach(function (camera) {
        var online = Boolean(data[camera.id] && data[camera.id].connected);
        var card = cards[camera.id];
        if (!card) return;

        if (online) {
          connected.add(camera.id);
          card.status.textContent = 'LIVE';
          card.status.classList.add('is-live');
          if (!card.image.src) card.image.src = card.image.dataset.streamSrc + '&_=' + Date.now();
          card.image.hidden = false;
          card.waiting.hidden = true;
        } else {
          connected.delete(camera.id);
          card.status.textContent = '연결 대기';
          card.status.classList.remove('is-live');
          card.image.hidden = true;
          if (card.image.src) card.image.removeAttribute('src');
          card.waiting.hidden = false;
        }
      });
      updateSummary();
    } catch (error) {
      connected.clear();
      cameras.forEach(function (camera) {
        var card = cards[camera.id];
        if (!card) return;
        card.status.textContent = '서버 확인 필요';
        card.status.classList.remove('is-live');
        card.image.hidden = true;
        if (card.image.src) card.image.removeAttribute('src');
        card.waiting.hidden = false;
      });
      updateSummary();
    }
  }

  function connectCameras() {
    var grid = document.getElementById('traffic-view');
    if (!grid) return;
    grid.replaceChildren();
    cameras.forEach(function (camera) { grid.append(makeCameraCard(camera)); });
    updateSummary();
    pollStatus();
    window.setInterval(pollStatus, 2000);
  }

  window.addEventListener('DOMContentLoaded', connectCameras);
})();
