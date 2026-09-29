(function () {
  'use strict';

  var cameras = [
    { id: 'cam1', label: 'CAM 01' },
    { id: 'cam2', label: 'CAM 02' }
  ];
  var connected = new Set();
  var serverBase = location.origin;

  function updateSummary() {
    var count = document.getElementById('source-count');
    var state = document.getElementById('system-state');
    var monitor = document.getElementById('monitor-status');
    if (count) count.innerHTML = connected.size + ' <small>/ 2대</small>';
    if (state) state.textContent = connected.size === 2 ? '정상 연결' : connected.size ? '일부 연결' : '연결 대기';
    if (monitor) monitor.textContent = connected.size === 2 ? '라즈베리 파이 카메라 LIVE' : connected.size ? '카메라 일부 연결' : '카메라 연결 대기';
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
    status.textContent = '연결 중';
    title.append(strong, status);

    var stage = document.createElement('div');
    stage.className = 'camera-stream-stage';
    var image = document.createElement('img');
    image.className = 'camera-stream';
    image.alt = camera.label + ' 라즈베리 파이 실시간 영상';
    image.src = serverBase + '/video_feed?cam_id=' + camera.id;
    var error = document.createElement('div');
    error.className = 'camera-stream-error';
    error.innerHTML = '<strong>영상 연결 실패</strong><p>Flask 영상 서버(:5000)와 라즈베리 파이 업로드 상태를 확인해 주세요.</p>';
    error.hidden = true;

    image.addEventListener('load', function () {
      connected.add(camera.id);
      status.textContent = 'LIVE';
      status.classList.add('is-live');
      error.hidden = true;
      image.hidden = false;
      updateSummary();
    });

    image.addEventListener('error', function () {
      connected.delete(camera.id);
      status.textContent = '연결 실패';
      status.classList.remove('is-live');
      image.hidden = true;
      error.hidden = false;
      updateSummary();
    });

    stage.append(image, error);
    article.append(title, stage);
    return article;
  }

  function connectCameras() {
    var grid = document.getElementById('traffic-view');
    if (!grid) return;
    grid.replaceChildren();
    cameras.forEach(function (camera) { grid.append(makeCameraCard(camera)); });
    updateSummary();
  }

  window.addEventListener('DOMContentLoaded', connectCameras);
})();