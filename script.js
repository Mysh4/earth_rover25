
// (() => {

//   /* -------------------------------------------------------
//       CONFIG
//   ---------------------------------------------------------*/

//   // TP-Link VIGI camera (RTSP → HLS/WebRTC through your proxy)
//   const CAM_LOGIN = "admin";
//   const CAM_PASSWORD = "admin1";
//   const CAM_HOST = "192.168.0.60";

//   const ESP32_MJPEG = "https://192.168.0.60/stream";

//   // This is the REAL RTSP URL (used by the proxy service, NOT by the browser)
//   const SAT_RTSP = `rtsp://${CAM_LOGIN}:${CAM_PASSWORD}@${CAM_HOST}:554/stream1`;

//   // Your proxy output (HLS/WebRTC)
//   const SAT_PROXY_URL = "/rtsp-proxy/vigi.m3u8";

//   // ESP32 MJPEG
//   const ESP32_URL = "http://192.168.0.165:82/stream";
//   // const ESP32_URL = "https://192.168.0.60/stream";
//   const DATA_URL  = "http://192.168.0.165:80/getHM";

//   /* -------------------------------------------------------
//       DOM ELEMENTS
//   ---------------------------------------------------------*/

//   const sensorTemp = document.getElementById('sensor-temp');
//   const sensorVolt = document.getElementById('sensor-voltage');
//   const sensorSpeed = document.getElementById('sensor-speed');

//   const imgSat = document.getElementById('img-sat');

//   const imgEsp = document.getElementById('img-esp');
//   const canvasEsp = document.getElementById('canvas-esp');

//   const btnSatStream = document.getElementById('btn-sat-stream');
//   const btnMjpegStream = document.getElementById('btn-mjpeg-stream');

//   /* -------------------------------------------------------
//       SENSOR DATA POLLING
//   ---------------------------------------------------------*/

//   let dataInterval = null;

//   async function fetchData() {
//     try {
//       const resp = await fetch(DATA_URL);
//       if (!resp.ok) return;

//       const txt = await resp.text();
//       const [temp, hum, mag1, mag2] = txt.split("|").map(Number);

//       sensorTemp.textContent = temp.toFixed(1) + " °C";
//       sensorVolt.textContent = hum.toFixed(1) + " %";
//       sensorSpeed.textContent =
//         (mag1 === 1 || mag2 === 1) ? "Magnet detected" : "Magnet not detected";

//     } catch (e) {
//       console.warn("Sensor polling error:", e);
//     }
//   }

//   function startDataPolling() {
//     if (dataInterval) return;
//     fetchData();
//     dataInterval = setInterval(fetchData, 2000);
//   }

//   /* -------------------------------------------------------
//       ESP32 MJPEG STREAM
//   ---------------------------------------------------------*/

//   let espReader = null;
//   let espAbort = null;
//   let espRunning = false;

//   async function startESPStream() {
//     stopESPStream(); // stop previous session
//     espRunning = true;

//     canvasEsp.style.display = "block";
//     imgEsp.style.display = "none";

//     try {
//       espAbort = new AbortController();
//       const resp = await fetch(ESP32_URL, { signal: espAbort.signal });

//       if (!resp.ok || !resp.body) throw new Error("No MJPEG stream");

//       espReader = resp.body.getReader();
//       const ctx = canvasEsp.getContext("2d");

//       let buffer = new Uint8Array();

//       while (espRunning) {
//         const chunk = await espReader.read();
//         if (chunk.done) throw new Error("Stream ended");
//         const { value } = chunk;

//         const merged = new Uint8Array(buffer.length + value.length);
//         merged.set(buffer);
//         merged.set(value, buffer.length);
//         buffer = merged;

//         const start = buffer.indexOf(0xFF);
//         if (start === -1) continue;

//         let end = -1;
//         for (let i = start; i < buffer.length - 1; i++) {
//           if (buffer[i] === 0xFF && buffer[i + 1] === 0xD9) {
//             end = i + 1;
//             break;
//           }
//         }
//         if (end === -1) continue;

//         const frame = buffer.slice(start, end + 1);
//         buffer = buffer.slice(end + 1);

//         try {
//           const bitmap = await createImageBitmap(new Blob([frame], { type: "image/jpeg" }));
//           canvasEsp.width = bitmap.width;
//           canvasEsp.height = bitmap.height;
//           ctx.drawImage(bitmap, 0, 0);
//           bitmap.close();
//         } catch (e) {
//           console.log("MJPEG decode error:", e);
//         }
//       }

//     } catch (e) {
//       if (espRunning) {
//         console.warn("ESP stream dropped → reconnecting...");
//         setTimeout(startESPStream, 1500);
//       }
//     }
//   }

//   function stopESPStream() {
//     espRunning = false;
//     if (espReader) espReader.cancel().catch(() => {});
//     if (espAbort) espAbort.abort();
//     canvasEsp.style.display = "none";
//     imgEsp.style.display = "block";
//   }

//   /* -------------------------------------------------------
//       EXTERNAL TP-LINK VIGI STREAM
//       (browser receives HLS or WebRTC, NOT RTSP)
//   ---------------------------------------------------------*/

//   let satRunning = false;

//   function startSatStream() {
//     satRunning = true;

//     // Your proxy must provide HLS/WebRTC
//     imgSat.src = SAT_PROXY_URL;

//     btnSatStream.textContent = "Stop External Stream";
//     console.log("VIGI stream started via proxy:", SAT_PROXY_URL);
//   }

//   function stopSatStream() {
//     satRunning = false;
//     imgSat.src = "https://via.placeholder.com/800x450?text=VIGI+Camera";
//     btnSatStream.textContent = "External Stream";
//   }

//   /* -------------------------------------------------------
//       BUTTONS
//   ---------------------------------------------------------*/

//   btnSatStream.onclick = () => {
//     satRunning ? stopSatStream() : startSatStream();
//   };

//   btnMjpegStream.onclick = () => {
//     espRunning ? stopESPStream() : startESPStream();
//   };

//   /* -------------------------------------------------------
//       INIT
//   ---------------------------------------------------------*/

//   startDataPolling();

//   window.addEventListener("beforeunload", () => {
//     stopESPStream();
//     stopSatStream();
//   });

// })();

(() => {

  /* -------------------------------------------------------
      CONFIG
  ---------------------------------------------------------*/

  const CAM_LOGIN = "admin";
  const CAM_PASSWORD = "admin1";
  const CAM_HOST = "192.168.0.60";

  const ESP32_URL = "http://192.168.0.165:82/stream";
  const DATA_URL  = "http://192.168.0.165:80/getHM";

  // SAT POST request payload
  const SAT_PAYLOAD = `----client-stream-boundary--
Content-Type: application/json
Content-Length: 101

{"type":"request","seq":1,"params":{"method":"get","preview":{"channels":[0],"resolutions":["vga"]}}}`;

  const imgSat = document.getElementById('img-sat');
  const canvasEsp = document.getElementById('canvas-esp');
  const imgEsp = document.getElementById('img-esp');

  const sensorTemp = document.getElementById('sensor-temp');
  const sensorVolt = document.getElementById('sensor-voltage');
  const sensorSpeed = document.getElementById('sensor-speed');

  const btnSatStream = document.getElementById('btn-sat-stream');
  const btnMjpegStream = document.getElementById('btn-mjpeg-stream');

  /* -------------------------------------------------------
      SENSOR DATA POLLING
  ---------------------------------------------------------*/

  let dataInterval = null;

  async function fetchData() {
    try {
      const resp = await fetch(DATA_URL);
      if (!resp.ok) return;
      const txt = await resp.text();
      const [temp, hum, mag1, mag2] = txt.split("|").map(Number);
      sensorTemp.textContent = temp.toFixed(1) + " °C";
      sensorVolt.textContent = hum.toFixed(1) + " %";
      sensorSpeed.textContent = (mag1 === 1 || mag2 === 1) ? "Magnet detected" : "Magnet not detected";
    } catch (e) {
      console.warn("Sensor polling error:", e);
    }
  }

  function startDataPolling() {
    if (dataInterval) return;
    fetchData();
    dataInterval = setInterval(fetchData, 2000);
  }

  /* -------------------------------------------------------
      ESP32 MJPEG STREAM
  ---------------------------------------------------------*/

  let espReader = null;
  let espAbort = null;
  let espRunning = false;

  async function startESPStream() {
    stopESPStream();
    espRunning = true;
    canvasEsp.style.display = "block";
    imgEsp.style.display = "none";

    try {
      espAbort = new AbortController();
      const resp = await fetch(ESP32_URL, { signal: espAbort.signal });
      if (!resp.ok || !resp.body) throw new Error("No MJPEG stream");
      espReader = resp.body.getReader();
      const ctx = canvasEsp.getContext("2d");
      let buffer = new Uint8Array();

      while (espRunning) {
        const chunk = await espReader.read();
        if (chunk.done) throw new Error("Stream ended");
        const { value } = chunk;

        const merged = new Uint8Array(buffer.length + value.length);
        merged.set(buffer);
        merged.set(value, buffer.length);
        buffer = merged;

        const start = buffer.indexOf(0xFF);
        if (start === -1) continue;
        let end = -1;
        for (let i = start; i < buffer.length - 1; i++) {
          if (buffer[i] === 0xFF && buffer[i + 1] === 0xD9) {
            end = i + 1;
            break;
          }
        }
        if (end === -1) continue;

        const frame = buffer.slice(start, end + 1);
        buffer = buffer.slice(end + 1);

        try {
          const bitmap = await createImageBitmap(new Blob([frame], { type: "image/jpeg" }));
          canvasEsp.width = bitmap.width;
          canvasEsp.height = bitmap.height;
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
        } catch (e) {
          console.log("MJPEG decode error:", e);
        }
      }

    } catch (e) {
      if (espRunning) {
        console.warn("ESP stream dropped → reconnecting...");
        setTimeout(startESPStream, 1500);
      }
    }
  }

  function stopESPStream() {
    espRunning = false;
    if (espReader) espReader.cancel().catch(() => {});
    if (espAbort) espAbort.abort();
    canvasEsp.style.display = "none";
    imgEsp.style.display = "block";
  }

  /* -------------------------------------------------------
      EXTERNAL TP-LINK VIGI STREAM (MJPEG via POST)
  ---------------------------------------------------------*/

  let satReader = null;
  let satAbort = null;
  let satRunning = false;

  // async function startSatStream() {
  //   stopSatStream();
  //   satRunning = true;

  //   imgSat.style.display = "none";
  //   canvasSat.style.display = "block";

  //   try {
  //     satAbort = new AbortController();
  //     const resp = await fetch(`https://${CAM_HOST}/stream`, {
  //       method: "POST",
  //       headers: {
  //         "Authorization": 'Digest username="admin", realm="TP-LINK IP-Camera", nonce="d5515fe7182e83cf10f311bb5c067434", uri="/stream", response="ff1a8a03174567284fd70de5e7baa19d", opaque="64943214654649846565646421", qop="auth", nc="00000001", cnonce="3gvk08q1svnzo6n7"',
  //         "Content-Type": "multipart/mixed;boundary=--client-stream-boundary--"
  //       },
  //       body: SAT_PAYLOAD,
  //       signal: satAbort.signal
  //     });

  //     if (!resp.ok || !resp.body) throw new Error("No SAT stream");

  //     satReader = resp.body.getReader();
  //     const ctx = canvasSat.getContext("2d");
  //     let buffer = new Uint8Array();

  //     while (satRunning) {
  //       const chunk = await satReader.read();
  //       if (chunk.done) throw new Error("Stream ended");
  //       const { value } = chunk;

  //       const merged = new Uint8Array(buffer.length + value.length);
  //       merged.set(buffer);
  //       merged.set(value, buffer.length);
  //       buffer = merged;

  //       const start = buffer.indexOf(0xFF);
  //       if (start === -1) continue;
  //       let end = -1;
  //       for (let i = start; i < buffer.length - 1; i++) {
  //         if (buffer[i] === 0xFF && buffer[i + 1] === 0xD9) {
  //           end = i + 1;
  //           break;
  //         }
  //       }
  //       if (end === -1) continue;

  //       const frame = buffer.slice(start, end + 1);
  //       buffer = buffer.slice(end + 1);

  //       try {
  //         const bitmap = await createImageBitmap(new Blob([frame], { type: "image/jpeg" }));
  //         canvasSat.width = bitmap.width;
  //         canvasSat.height = bitmap.height;
  //         ctx.drawImage(bitmap, 0, 0);
  //         bitmap.close();
  //       } catch (e) {
  //         console.log("SAT decode error:", e);
  //       }
  //     }

  //   } catch (e) {
  //     if (satRunning) {
  //       console.warn("SAT stream dropped → reconnecting...");
  //       setTimeout(startSatStream, 1500);
  //     }
  //   }
  // }
const canvasSat = document.getElementById('canvas-sat');
const SAT_URL = `https://${CAM_HOST}/stream`;

async function startSatStream() {
  stopSatStream();
  satRunning = true;
  canvasSat.style.display = "block";
  imgSat.style.display = "none";

  try {
    satAbort = new AbortController();
    const resp = await fetch(SAT_URL, {
      method: "POST",
      headers: {
        "Authorization": 'Digest username="admin", realm="TP-LINK IP-Camera", nonce="d5515fe7182e83cf10f311bb5c067434", uri="/stream", response="ff1a8a03174567284fd70de5e7baa19d", opaque="64943214654649846565646421", qop="auth", nc="00000001", cnonce="3gvk08q1svnzo6n7"',
        "Content-Type": "multipart/mixed;boundary=--client-stream-boundary--"
      },
      body: SAT_PAYLOAD,
      signal: satAbort.signal
    });

    if (!resp.ok || !resp.body) throw new Error("No SAT stream");

    satReader = resp.body.getReader();
    const ctx = canvasSat.getContext("2d");
    let buffer = new Uint8Array();

    while (satRunning) {
      const chunk = await satReader.read();
      if (chunk.done) throw new Error("Stream ended");
      const { value } = chunk;

      const merged = new Uint8Array(buffer.length + value.length);
      merged.set(buffer);
      merged.set(value, buffer.length);
      buffer = merged;

      const start = buffer.indexOf(0xFF);
      if (start === -1) continue;
      let end = -1;
      for (let i = start; i < buffer.length - 1; i++) {
        if (buffer[i] === 0xFF && buffer[i + 1] === 0xD9) {
          end = i + 1;
          break;
        }
      }
      if (end === -1) continue;

      const frame = buffer.slice(start, end + 1);
      buffer = buffer.slice(end + 1);

      try {
        const bitmap = await createImageBitmap(new Blob([frame], { type: "image/jpeg" }));
        canvasSat.width = bitmap.width;
        canvasSat.height = bitmap.height;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
      } catch (e) {
        console.log("SAT decode error:", e);
      }
    }

  } catch (e) {
    if (satRunning) {
      console.warn("SAT stream dropped → reconnecting...");
      setTimeout(startSatStream, 1500);
    }
  }
}

function stopSatStream() {
  satRunning = false;
  if (satReader) satReader.cancel().catch(() => {});
  if (satAbort) satAbort.abort();
  imgSat.style.display = "block";
  canvasSat.style.display = "none";
}


  /* -------------------------------------------------------
      BUTTONS
  ---------------------------------------------------------*/

  btnSatStream.onclick = () => {
    satRunning ? stopSatStream() : startSatStream();
  };

  btnMjpegStream.onclick = () => {
    espRunning ? stopESPStream() : startESPStream();
  };

  /* -------------------------------------------------------
      INIT
  ---------------------------------------------------------*/

  startDataPolling();

  window.addEventListener("beforeunload", () => {
    stopESPStream();
    stopSatStream();
  });

})();
