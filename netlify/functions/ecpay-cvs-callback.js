exports.handler = async (event) => {
  const params = Object.fromEntries(new URLSearchParams(event.body));

  const storeName = params.CVSStoreName || '';
  const storeId = params.CVSStoreID || '';
  const storeAddress = params.CVSAddress || '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>選擇完成</title></head>
<body>
<p style="font-family:sans-serif;text-align:center;margin-top:40px;">
  ✅ 已選擇門市：${storeName}<br>
  <small>視窗將自動關閉...</small>
</p>
<script>
  if (window.opener) {
    window.opener.postMessage({
      storeName: ${JSON.stringify(storeName)},
      storeId: ${JSON.stringify(storeId)},
      storeAddress: ${JSON.stringify(storeAddress)},
    }, '*');
  }
  setTimeout(() => window.close(), 1000);
</script>
</body>
</html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html,
  };
};
