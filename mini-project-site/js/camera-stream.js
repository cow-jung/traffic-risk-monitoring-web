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

  function markLive(cameraId) {
    var card = cards[cameraId];
    if (!card) return;
    connected.add(cameraId);
    card.status.textContent = 'LIVE';
    card.status.classList.add('is-live');
    card.image.hidden = false;
    card.waiting.hidden = true;
    updateSummary();
  }

  function startStream(cameraId, force) {
    var card = cards[cameraId];
    if (!card) return;
    if (force || !card.image.getAttribute('src')) {
      card.image.src = card.image.dataset.streamSrc + '&_=' + Date.now();
    }
    card.image.hidden = false;
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
    status.textContent = '영상 연결 중';
    title.append(strong, status);

    var stage = document.createElement('div');
    stage.className = 'camera-stream-stage';
    var image = document.createElement('img');
    image.className = 'camera-stream';
    image.alt = camera.label + ' 실시간 AI 분석 영상';
    image.dataset.streamSrc = serverBase + '/video_feed?cam_id=' + camera.id;

    var waiting = document.createElement('div');
    waiting.className = 'camera-stream-error';
    waiting.innerHTML = '<strong>카메라 영상 연결 중</strong><p>AI 서버의 실시간 영상 스트림을 연결하고 있습니다.</p>';
    waiting.hidden = true;

    image.addEventListener('load', function () {
      markLive(camera.id);
    });

    image.addEventListener('error', function () {
      connected.delete(camera.id);
      image.hidden = true;
      waiting.hidden = false;
      status.textContent = '영상 재연결 중';
      status.classList.remove('is-live');
      updateSummary();
      window.setTimeout(function () { startStream(camera.id, true); }, 3000);
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
        var card = cards[camera.id];
        if (!card) return;

        // debug_status의 connected 값은 보조 상태로만 사용합니다.
        // 실제 영상 표시 여부는 MJPEG <img> 스트림의 load/error가 결정합니다.
        if (!card.image.getAttribute('src')) startStream(camera.id, false);

        if (data[camera.id] && data[camera.id].connected && !connected.has(camera.id)) {
          card.status.textContent = '영상 연결 중';
        }
      });
    } catch (error) {
      // 상태 API가 잠시 실패해도 정상 동작 중인 영상 스트림을 끊지 않습니다.
      cameras.forEach(function (camera) {
        var card = cards[camera.id];
        if (card && !card.image.getAttribute('src')) startStream(camera.id, false);
      });
    }
  }

  function connectCameras() {
    var grid = document.getElementById('traffic-view');
    if (!grid) return;
    grid.replaceChildren();
    cameras.forEach(function (camera) {
      grid.append(makeCameraCard(camera));
      startStream(camera.id, false);
    });
    updateSummary();
    pollStatus();
    window.setInterval(pollStatus, 3000);
  }

  window.addEventListener('DOMContentLoaded', connectCameras);
})();