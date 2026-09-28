/* 대시보드: 로컬 매체 미리보기와 예시 탐지 기록.
   실제 탐지 결과는 이후 서버 API 연결 시 이 예시 데이터 대신 공급합니다. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  if (!$('dash-panel')) return;

  var labels = { parking: '주정차', wrongway: '역주행', wood: '목재', box: '상자', pet: '페트병' };
  var icons = { parking: 'P', wrongway: '↩', wood: '▤', box: '□', pet: '◉' };
  var initial = {
    traffic: [
      { type: 'parking', camera: 'CAM 01', confidence: .94, time: '10:41:12', reason: '예시: 지정 구역에서 차량이 설정 시간 이상 정차한 것으로 가정했습니다.' },
      { type: 'wrongway', camera: 'CAM 02', confidence: .89, time: '10:32:07', reason: '예시: 차량의 이동 방향이 지정된 진행 방향과 반대인 것으로 가정했습니다.' }
    ],
    objects: [
      { type: 'box', confidence: .91, time: '10:42:18', reason: '예시: 도로 영역에서 상자 형태의 객체를 탐지한 것으로 가정했습니다.' },
      { type: 'wood', confidence: .86, time: '10:37:05', reason: '예시: 도로 영역에서 목재 형태의 객체를 탐지한 것으로 가정했습니다.' },
      { type: 'pet', confidence: .79, time: '10:29:41', reason: '예시: 도로 영역에서 페트병 형태의 객체를 탐지한 것으로 가정했습니다.' }
    ]
  };
  var records = structuredClone(initial);
  var view = 'traffic';
  var next = { traffic: 0, objects: 0 };
  var media = null;
  var localUrls = new Set();

  function currentTime() {
    var now = new Date();
    return [now.getHours(), now.getMinutes(), now.getSeconds()].map(function (n) { return String(n).padStart(2, '0'); }).join(':');
  }

  function mediaElement(source, detail) {
    var element;
    if (source.kind === 'youtube') {
      element = document.createElement('iframe');
      element.src = 'https://www.youtube-nocookie.com/embed/' + source.youtube + (source.start ? '?start=' + source.start : '');
      element.title = '영상 미리보기';
      element.allow = 'autoplay; encrypted-media; picture-in-picture';
      element.allowFullscreen = true;
    } else if (source.kind === 'image') {
      element = document.createElement('img');
      element.src = source.url;
      element.alt = detail ? '탐지 기록에 연결된 사진' : '선택한 사진';
      element.onerror = function () { $('source-error').textContent = '사진을 불러올 수 없습니다. 링크와 접근 권한을 확인해 주세요.'; };
    } else {
      element = document.createElement('video');
      element.src = source.url;
      element.controls = true;
      element.playsInline = true;
      element.preload = 'metadata';
      if (detail && source.position) {
        element.addEventListener('loadedmetadata', function () {
          element.currentTime = Math.min(source.position, element.duration || source.position);
        }, { once: true });
      }
      element.onerror = function () { $('source-error').textContent = '영상을 재생할 수 없습니다. 직접 영상 파일 주소인지 확인하거나 파일을 선택해 주세요.'; };
    }
    return element;
  }

  function selectMedia(source) {
    media = source;
    $('source-error').textContent = '';
    $('media-stage').replaceChildren(mediaElement(source, false));
    $('media-name').textContent = source.name;
    render();
  }

  function linkSource(text) {
    var url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('http 또는 https 링크를 입력해 주세요.');
    var host = url.hostname.toLowerCase();
    var youtube = null;
    if (host === 'youtu.be') youtube = url.pathname.slice(1).split('/')[0];
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
      youtube = url.searchParams.get('v') || (url.pathname.match(/^\/shorts\/([^/]+)/) || [])[1];
    }
    if (youtube) {
      if (!/^[a-zA-Z0-9_-]{11}$/.test(youtube)) throw new Error('YouTube 영상 링크를 확인해 주세요.');
      return { kind: 'youtube', youtube: youtube, start: Math.max(0, parseInt(url.searchParams.get('t'), 10) || 0), url: url.href, name: 'YouTube 영상' };
    }
    if (/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(url.pathname)) return { kind: 'image', url: url.href, name: url.href };
    if (/\.(mp4|webm|ogg|m4v|mov)$/i.test(url.pathname)) return { kind: 'video', url: url.href, name: url.href };
    throw new Error('직접 영상(.mp4 등), 사진(.jpg 등) 또는 YouTube 링크를 사용해 주세요.');
  }

  function fillTypeFilter() {
    var options = view === 'traffic'
      ? [['all', '전체 유형'], ['parking', '주정차'], ['wrongway', '역주행']]
      : [['all', '전체 유형'], ['wood', '목재'], ['box', '상자'], ['pet', '페트병']];
    if ($('type-filter').options.length === options.length && $('type-filter').options[1].value === options[1][0]) return;
    $('type-filter').replaceChildren.apply($('type-filter'), options.map(function (pair) { return new Option(pair[1], pair[0]); }));
  }

  function renderLegacy() {
    // 기존 하단 목록을 새 탐지 기록과 같은 데이터로 표시합니다.
    var events = records[view];
    var table = $('detection-table-body');
    var alerts = $('alert-list');
    var log = $('log-list');
    if (table) {
      table.replaceChildren();
      events.slice(0, 5).forEach(function (event) {
        var row = document.createElement('tr');
        row.className = 'clickable';
        row.addEventListener('click', function () { openDetails(event); });
        [event.time, labels[event.type] + ' · 예시', Math.round(event.confidence * 100) + '%'].forEach(function (text, index) {
          var cell = document.createElement('td');
          if (index === 0) {
            var openButton = document.createElement('button');
            openButton.type = 'button';
            openButton.className = 'result-open';
            openButton.textContent = text;
            openButton.setAttribute('aria-label', event.time + ' ' + labels[event.type] + ' 탐지 상세 보기');
            cell.append(openButton);
          } else {
            cell.textContent = text;
          }
          row.append(cell);
        });
        table.append(row);
      });
    }
    if (alerts) {
      alerts.replaceChildren();
      events.slice(0, 4).forEach(function (event) {
        var item = document.createElement('li');
        var label = document.createElement('span');
        var time = document.createElement('span');
        label.textContent = labels[event.type] + ' · 예시' + (event.camera ? ' · ' + event.camera : '');
        time.className = 'alert-time';
        time.textContent = event.time;
        item.append(label, time);
        alerts.append(item);
      });
    }
    if (log) {
      log.replaceChildren();
      events.forEach(function (event) {
        var item = document.createElement('li');
        var time = document.createElement('span');
        var text = document.createElement('span');
        time.className = 't';
        time.textContent = event.time;
        text.textContent = labels[event.type] + ' · 신뢰도 ' + Math.round(event.confidence * 100) + '% · 예시';
        item.append(time, text);
        log.append(item);
      });
    }
  }

  function render() {
    fillTypeFilter();
    var events = records[view];
    var shown = events.filter(function (event) {
      return (view === 'objects' || $('camera-filter').value === 'all' || event.camera === $('camera-filter').value)
        && ($('type-filter').value === 'all' || event.type === $('type-filter').value);
    });
    $('event-list').replaceChildren();
    if (!shown.length) {
      var empty = document.createElement('p');
      empty.className = 'event-empty';
      empty.textContent = '표시할 예시 탐지 기록이 없습니다.';
      $('event-list').append(empty);
    }
    shown.forEach(function (event) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'event-entry';
      var icon = document.createElement('span');
      icon.className = 'event-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = icons[event.type];
      var content = document.createElement('span');
      var title = document.createElement('strong');
      title.textContent = labels[event.type] + ' 탐지 · 예시';
      var details = document.createElement('p');
      details.textContent = (event.camera ? event.camera + ' · ' : '') + '신뢰도 ' + Math.round(event.confidence * 100) + '%';
      var time = document.createElement('time');
      time.textContent = event.time;
      var hint = document.createElement('p');
      hint.className = 'event-hint';
      hint.textContent = '상세 보기';
      content.append(title, details, time, hint);
      item.append(icon, content);
      item.addEventListener('click', function () { openDetails(event); });
      $('event-list').append(item);
    });

    $('detection-count').textContent = events.length + '건 · 예시';
    $('latest-event').textContent = events.length ? labels[events[0].type] + ' · 예시' : '없음';
    $('source-label').textContent = view === 'traffic' ? '연결된 카메라' : '선택한 매체';
    $('source-count').innerHTML = view === 'traffic' ? '0 <small>/ 2대</small>' : (media ? '1 <small>개</small>' : '0 <small>개</small>');
    $('system-state').textContent = view === 'traffic' ? '연결 대기' : (media ? '매체 확인 중' : '매체 대기');
    $('dash-subtitle').textContent = view === 'traffic' ? '카메라 2대 · 주정차 및 역주행' : '영상 링크 또는 사진·영상 파일 · 낙하물 대시보드';
    $('monitor-title').textContent = view === 'traffic' ? '카메라 화면' : '영상·사진 확인';
    $('monitor-status').textContent = view === 'traffic' ? '라즈베리 파이 연결 전' : '자동 탐지 모델 연결 전';
    $('traffic-view').hidden = view !== 'traffic';
    $('objects-view').hidden = view !== 'objects';
    $('camera-filter').hidden = view !== 'traffic';
    $('criteria-title').textContent = view === 'traffic' ? '주정차·역주행 판정' : '낙하물 탐지 클래스';
    $('criteria-copy').innerHTML = view === 'traffic'
      ? '주정차는 지정 구역의 정차 지속 시간, 역주행은 차량 이동 방향을 기준으로 판정할 예정입니다. 실제 판정 기준은 모델 연결 단계에서 확정합니다.'
      : '최종 모델의 탐지 대상입니다.<div class="criteria-tags"><span>wood · 목재</span><span>box · 상자</span><span>pet · 페트병</span></div>';
    document.querySelectorAll('.dash-tab').forEach(function (tab) {
      var selected = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    $('dash-panel').setAttribute('aria-labelledby', view === 'traffic' ? 'tab-traffic' : 'tab-objects');
    renderLegacy();
  }

  function openDetails(event) {
    $('event-title').textContent = labels[event.type] + ' 탐지 상세 · 예시';
    $('event-media').replaceChildren();
    if (event.media) {
      $('event-media').append(mediaElement(event.media, true));
    } else {
      var fallback = document.createElement('p');
      fallback.textContent = '이 예시 기록에 연결된 영상·사진이 없습니다.';
      $('event-media').append(fallback);
    }
    $('event-details').replaceChildren();
    [['유형', labels[event.type]], ['발생 시각', event.time], ['신뢰도', Math.round(event.confidence * 100) + '%'],
      ['출처', event.media ? event.media.name : (event.camera || '예시 데이터')]].forEach(function (pair) {
      var wrapper = document.createElement('div');
      var term = document.createElement('dt');
      var value = document.createElement('dd');
      term.textContent = pair[0];
      value.textContent = pair[1];
      wrapper.append(term, value);
      $('event-details').append(wrapper);
    });
    $('event-reason').textContent = '탐지 이유: ' + event.reason;
    $('event-dialog').showModal();
  }

  document.querySelectorAll('.dash-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      view = tab.dataset.view;
      $('camera-filter').value = 'all';
      $('type-filter').value = 'all';
      render();
    });
    tab.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      var other = $(tab.id === 'tab-traffic' ? 'tab-objects' : 'tab-traffic');
      other.click();
      other.focus();
    });
  });
  $('camera-filter').addEventListener('change', render);
  $('type-filter').addEventListener('change', render);
  $('open-link').addEventListener('click', function () {
    try { selectMedia(linkSource($('media-url').value.trim())); }
    catch (error) { $('source-error').textContent = error instanceof TypeError ? '올바른 주소를 입력해 주세요.' : error.message; }
  });
  $('media-url').addEventListener('keydown', function (event) { if (event.key === 'Enter') $('open-link').click(); });
  $('choose-media-file').addEventListener('click', function () { $('media-file').click(); });
  $('media-file').addEventListener('change', function (event) {
    var file = event.target.files[0];
    if (!file) return;
    $('selected-file-name').textContent = file.name;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      $('source-error').textContent = '사진 또는 영상 파일만 선택해 주세요.';
      return;
    }
    var url = URL.createObjectURL(file);
    localUrls.add(url);
    selectMedia({ kind: file.type.startsWith('image/') ? 'image' : 'video', url: url, name: file.name });
    event.target.value = '';
  });
  $('add-demo').addEventListener('click', function () {
    var index = next[view]++;
    var type = view === 'traffic' ? ['parking', 'wrongway'][index % 2] : ['wood', 'box', 'pet'][index % 3];
    var detection = {
      type: type,
      camera: view === 'traffic' ? (index % 2 ? 'CAM 02' : 'CAM 01') : undefined,
      confidence: [.88, .93, .81][index % 3],
      time: currentTime(),
      reason: type === 'parking' ? '예시: 지정 구역에서 차량이 설정 시간 이상 정차한 것으로 가정했습니다.'
        : type === 'wrongway' ? '예시: 차량이 지정된 진행 방향과 반대로 이동한 것으로 가정했습니다.'
          : '예시: 도로 영역에서 ' + labels[type] + ' 형태의 객체를 탐지한 것으로 가정했습니다. 실제 모델 판정은 수행하지 않았습니다.'
    };
    if (view === 'objects' && media) {
      var player = $('media-stage').querySelector('video');
      detection.media = Object.assign({}, media, { position: player ? player.currentTime : 0 });
    }
    records[view].unshift(detection);
    render();
  });
  $('reset-demo').addEventListener('click', function () {
    records = structuredClone(initial);
    next = { traffic: 0, objects: 0 };
    $('camera-filter').value = 'all';
    $('type-filter').value = 'all';
    render();
  });
  $('close-dialog').addEventListener('click', function () { $('event-dialog').close(); });
  $('event-dialog').addEventListener('close', function () { $('event-media').replaceChildren(); });
  document.querySelectorAll('#model-compare .tab-btn').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('#model-compare .tab-btn').forEach(function (button) {
        button.classList.remove('active');
        button.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('#model-compare .model-panel').forEach(function (panel) { panel.classList.remove('active'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      $(tab.dataset.target).classList.add('active');
    });
  });
  $('report-btn').addEventListener('click', function () {
    var note = $('report-status');
    if (!note) {
      note = document.createElement('p');
      note.id = 'report-status';
      note.className = 'source-hint';
      note.setAttribute('role', 'status');
      $('report-btn').after(note);
    }
    note.textContent = '현재는 예시 대시보드입니다. 신고 전송은 서버 연결 후 사용할 수 있습니다.';
  });
  window.addEventListener('pagehide', function () { localUrls.forEach(function (url) { URL.revokeObjectURL(url); }); });
  render();
})();
