<?php
// 遊玩人數計數器：GET 直接 +1 並回傳；?peek=1 只讀不加
header('Content-Type: application/json');
header('Cache-Control: no-store');
$f = __DIR__ . '/playcount.txt';
$fp = fopen($f, 'c+');
if (!$fp) { echo json_encode(['count' => 180]); exit; }
flock($fp, LOCK_EX);
$n = intval(stream_get_contents($fp));
if ($n < 180) $n = 180; // 起算基數
if (!isset($_GET['peek'])) $n++;
ftruncate($fp, 0);
rewind($fp);
fwrite($fp, strval($n));
flock($fp, LOCK_UN);
fclose($fp);
echo json_encode(['count' => $n]);
