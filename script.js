(() => {
  const chkSim = document.getElementById('chk-sim');
  const statusEl = document.getElementById('status');

  const sensorUltr = document.getElementById('sensor-ultrasonic');
  const sensorTemp = document.getElementById('sensor-temp');
  const sensorVolt = document.getElementById('sensor-voltage');
  const sensorSpeed = document.getElementById('sensor-speed');

  const imgSat = document.getElementById('img-sat');
  const imgEsp = document.getElementById('img-esp');
  const canvasEsp = document.getElementById('canvas-esp');
  const urlSat = document.getElementById('url-sat');
  const urlEsp = document.getElementById('url-esp');
  const chkMJPEG = document.getElementById('chk-mjpeg');
  const btnSet = document.getElementById('btn-set');
  const btnRefresh = document.getElementById('btn-refresh');

  let simInterval = null;

  function appendLog(text){
    const msg = `[${new Date().toLocaleTimeString()}] ${text}`;
    console.log(msg);
    if(statusEl) statusEl.textContent = text;
  }

  function random(min, max){ return Math.round((Math.random()*(max-min)+min)*10)/10 }

  // hallCount stores cumulative number of magnetic hall checkpoints passed
  let hallCount = 0;

  // history buffers and Chart.js setup (temperature + humidity only)
  const maxPoints = 60;
  const history = { labels: [], temp: [], humidity: [] };

  function updateSensors(){
    const t = random(15,40);
    const h = random(20,90);
    // update sensor displays
    sensorTemp.textContent = t + ' °C';
    sensorVolt.textContent = h + ' %';
    sensorSpeed.textContent = hallCount;

    const label = new Date().toLocaleTimeString();
    history.labels.push(label);
    history.temp.push(t);
    history.humidity.push(h);

    // trim
    if(history.labels.length > maxPoints){ history.labels.shift(); history.temp.shift(); history.humidity.shift(); }

    // update charts if ready
    if(window.charts){
      try{
        window.charts.temp.data.labels = history.labels;
        window.charts.temp.data.datasets[0].data = history.temp;
        window.charts.temp.update('none');

        window.charts.humidity.data.labels = history.labels;
        window.charts.humidity.data.datasets[0].data = history.humidity;
        window.charts.humidity.update('none');
      }catch(e){console.warn(e)}
    }
  }

  function simulateStep(){
    const actions = ['движение вперёд','поворот влево','поворот вправо','остановка','объезд препятствия','ускорение'];
    const a = actions[Math.floor(Math.random()*actions.length)];
    appendLog('Действие: ' + a);
    // occasionally increment hall checkpoint counter (simulate hall sensor trigger)
    if(Math.random() < 0.35){
      hallCount += Math.floor(Math.random()*2) + 1; // +1 or +2
      appendLog('Чекпоинт (холл) пройден. Всего: ' + hallCount);
    }
    updateSensors();
  }

  // Chart.js initialization
  function initCharts(){
    if(typeof Chart === 'undefined'){
      console.warn('Chart.js not loaded');
      return;
    }
    const cfg = (label, color) => ({
      type: 'line',
      data: { labels: history.labels.slice(), datasets: [{ label, data: [], borderColor: color, backgroundColor: 'transparent', tension: 0.2 }] },
      options: { animation: false, responsive: true, plugins:{legend:{display:false}}, scales:{x:{display:false}} }
    });
    const cT = document.getElementById('chart-temp').getContext('2d');
    const cH = document.getElementById('chart-humidity').getContext('2d');

    window.charts = {
      temp: new Chart(cT, cfg('Температура (°C)', '#ffb74d')),
      humidity: new Chart(cH, cfg('Влажность (%)', '#81c784'))
    };
  }

  function startSim(){
    if(simInterval) return;
    simInterval = setInterval(()=>{ if(chkSim.checked) simulateStep(); }, 2000);
  }

  function stopSim(){ if(simInterval){clearInterval(simInterval); simInterval=null} }

  // clear/copy log buttons removed — no-op if present

  btnSet.addEventListener('click', ()=>{
    if(urlSat.value) imgSat.src = urlSat.value;
    if(urlEsp.value){
      if(chkMJPEG && chkMJPEG.checked){
        // start MJPEG streaming to canvas
        startESPStream(urlEsp.value);
      }else{
        stopESPStream();
        canvasEsp.style.display = 'none';
        imgEsp.style.display = '';
        imgEsp.src = urlEsp.value;
      }
    }
  });

  btnRefresh.addEventListener('click', ()=>{
    // force reload by appending timestamp
    imgSat.src = (urlSat.value || imgSat.src).split('?')[0] + '?_t=' + Date.now();
    if(chkMJPEG && chkMJPEG.checked){
      // restart stream to force reconnect
      stopESPStream();
      startESPStream(urlEsp.value || imgEsp.src);
    }else{
      imgEsp.src = (urlEsp.value || imgEsp.src).split('?')[0] + '?_t=' + Date.now();
    }
  });

  // toggle MJPEG checkbox
  if(chkMJPEG){
    chkMJPEG.addEventListener('change', ()=>{
      if(chkMJPEG.checked){
        // switch to canvas streaming
        canvasEsp.style.display = '';
        imgEsp.style.display = 'none';
        if(urlEsp.value) startESPStream(urlEsp.value);
      }else{
        stopESPStream();
        canvasEsp.style.display = 'none';
        imgEsp.style.display = '';
        if(urlEsp.value) imgEsp.src = urlEsp.value;
      }
    });
  }

  // MJPEG streaming implementation
  let espAbort = null;
  let espReader = null;
  let espRunning = false;

  async function startESPStream(url){
    stopESPStream();
    if(!url) return;
    espAbort = new AbortController();
    const signal = espAbort.signal;
    espRunning = true;
    appendLog('Запуск MJPEG-потока...');
    try{
      const resp = await fetch(url, {signal});
      if(!resp.ok || !resp.body){
        appendLog('Ошибка: не удалось получить поток ('+resp.status+')');
        espRunning = false;
        return;
      }

      const reader = resp.body.getReader();
      espReader = reader;
      let buffer = new Uint8Array(0);

      const ctx = canvasEsp.getContext('2d');

      while(true){
        const {done, value} = await reader.read();
        if(done) break;
        // append
        const newBuf = new Uint8Array(buffer.length + value.length);
        newBuf.set(buffer,0);
        newBuf.set(value, buffer.length);
        buffer = newBuf;

        // search for JPEG SOI/EOI markers
        let start = -1, end = -1;
        for(let i=0;i<buffer.length-1;i++){
          if(buffer[i]===0xFF && buffer[i+1]===0xD8){ start = i; break }
        }
        if(start>=0){
          for(let j=start+2;j<buffer.length-1;j++){
            if(buffer[j]===0xFF && buffer[j+1]===0xD9){ end = j+1; break }
          }
        }

        if(start>=0 && end>start){
          const frame = buffer.slice(start, end+1);
          // keep remainder
          buffer = buffer.slice(end+1);

          try{
            const blob = new Blob([frame], {type:'image/jpeg'});
            const bitmap = await createImageBitmap(blob);
            // resize canvas if needed
            if(canvasEsp.width !== bitmap.width || canvasEsp.height !== bitmap.height){
              canvasEsp.width = bitmap.width;
              canvasEsp.height = bitmap.height;
            }
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
          }catch(err){
            // ignore individual frame errors
            console.warn('frame draw error', err);
          }
        }
      }
    }catch(err){
      if(err.name === 'AbortError'){
        appendLog('MJPEG stream aborted');
      }else{
        appendLog('MJPEG stream error: ' + (err.message||err));
        // try reconnect after delay
        if(espRunning){
          setTimeout(()=>{ if(chkMJPEG.checked) startESPStream(url); }, 1500);
        }
      }
    }finally{
      espRunning = false;
    }
  }

  function stopESPStream(){
    try{
      if(espReader) { espReader.cancel().catch(()=>{}); espReader = null }
      if(espAbort){ espAbort.abort(); espAbort = null }
    }catch(e){}
    espRunning = false;
  }

  // Load from query params if provided: ?sat=...&esp=...
  (function loadFromQuery(){
    try{
      const qp = new URLSearchParams(location.search);
      const s = qp.get('sat');
      const e = qp.get('esp');
      if(s){ imgSat.src = s; urlSat.value = s }
      if(e){ imgEsp.src = e; urlEsp.value = e }
    }catch(err){console.warn(err)}
  })();

  // initialize charts and sensors, then start simulation
  initCharts();
  updateSensors();
  startSim();

  // create a couple initial log lines
  appendLog('Панель запущена');
  appendLog('Ожидание данных от робота...');

  // clean up on unload
  window.addEventListener('beforeunload', ()=>stopSim());
  window.addEventListener('unload', ()=>{ stopESPStream(); stopSim(); });
})();
