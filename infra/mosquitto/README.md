# Legatus Mosquitto setup

OwnTracks (iOS/Android) → MQTT → Legatus subscriber 用の broker. Legatus PC 同居前提.

## ファイル

| ファイル | 内容 | git |
|---------|------|-----|
| `mosquitto.conf` | broker config (listener 1883, authn 必須) | tracked |
| `acl` | per-user topic 制限 | tracked |
| `passwd` | bcrypt-hashed passwords | gitignored |
| `passwd.example` | passwd の shape リファレンス | tracked |
| `.passwords.txt` | 平文パスワード (OwnTracks app 設定用、 gitignored) | gitignored |

## passwd の生成

`docker run` で eclipse-mosquitto image の `mosquitto_passwd` を実行:

```powershell
# 1. 平文 passwd ファイルを作る
Set-Content -Path infra/mosquitto/passwd -Value "phone:CHANGE_ME_PHONE`nlegatus-sub:CHANGE_ME_SUB" -Encoding ASCII -NoNewline

# 2. mosquitto_passwd で in-place hash 化 (-U)
docker run --rm -v "${PWD}/infra/mosquitto/passwd:/mosquitto/config/passwd" eclipse-mosquitto:2.0 mosquitto_passwd -U /mosquitto/config/passwd
```

または個別に追加:

```powershell
docker run --rm -it -v "${PWD}/infra/mosquitto:/mosquitto/config" eclipse-mosquitto:2.0 mosquitto_passwd -c /mosquitto/config/passwd phone
docker run --rm -it -v "${PWD}/infra/mosquitto:/mosquitto/config" eclipse-mosquitto:2.0 mosquitto_passwd /mosquitto/config/passwd legatus-sub
```

## 起動

```powershell
docker compose up -d mosquitto
docker logs legatus-mosquitto -f
```

## 動作確認

```powershell
# subscribe (Legatus が叩く側)
docker run --rm -it --network host eclipse-mosquitto:2.0 mosquitto_sub -h 127.0.0.1 -p 1883 -u legatus-sub -P "<sub-password>" -t 'owntracks/+/+'

# publish テスト (phone を擬似)
docker run --rm -it --network host eclipse-mosquitto:2.0 mosquitto_pub -h 127.0.0.1 -p 1883 -u phone -P "<phone-password>" -t 'owntracks/phone/iphone' -m '{"_type":"location","lat":35.68,"lon":139.77,"tst":1714521600}'
```

## phone (OwnTracks app) 設定

`.passwords.txt` を見て:

| key | value |
|-----|-------|
| Mode | MQTT |
| Host | (tailscale magic DNS hostname or tailnet IP) |
| Port | 1883 (tailnet plain) / TLS funnel 経由なら 8443 |
| TLS | tailnet 内なら OFF / funnel 経由なら ON |
| Username | `phone` |
| Password | `.passwords.txt` の phone= の値 |
| TrackerID | `iP` 等 (任意 2 文字) |
| DeviceID | `iphone` (acl の `owntracks/phone/iphone` に合わせる) |
| Topic | デフォルト (`owntracks/<username>/<deviceid>`) |
