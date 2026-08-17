# Flight Tracker Discord Bot

항공편(콜사인/등록번호/hex)을 등록하면 무료 ADS-B 공개 API로 위치를 주기적으로 조회해,
등록된 채널 아래에 만들어진 전용 스레드에 지도·고도·속도 등을 담은 임베드로 갱신해주는
Discord 봇입니다.

## 데이터 출처

- 실시간 위치: [ADSB.lol](https://adsb.lol) (주), [ADSB.fi](https://adsb.fi) (폴백) — 둘 다 무료, API 키 불필요
- 항공사/경로/기종 메타데이터: [ADSB DB](https://www.adsbdb.com)
- 지도 타일: CARTO 무료 베이스맵 (env로 다른 타일 서버로 교체 가능)

## 빠른 시작

1. `.env.example`을 `.env`로 복사하고 값을 채웁니다 (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, DB 비밀번호 등).
   개발 중 슬래시 명령을 즉시 반영하려면 `DISCORD_GUILD_ID`도 설정하세요 (전역 등록은 최대 1시간 소요).
2. Discord 개발자 포털에서 봇에 다음 권한을 부여해 서버에 초대합니다:
   `View Channel`, `Send Messages`, `Create Public Threads`, `Send Messages in Threads`,
   `Embed Links`, `Attach Files`, `Manage Threads`.
3. 실행:

   ```bash
   docker compose up -d --build
   docker compose logs -f bot
   ```

봇이 기동하면서 DB 마이그레이션과 슬래시 명령 등록을 자동으로 수행합니다.

## 명령어

| 명령어 | 설명 |
|---|---|
| `/flight track <flight> [interval] [mode] [type]` | 추적 시작. 현재 채널에 스레드 생성 |
| `/flight untrack <flight>` | 추적 종료 |
| `/flight list` | 이 서버의 추적 목록 |
| `/flight info <flight>` | 등록 없이 즉시 1회 조회 |
| `/flight interval <flight> <seconds>` | 갱신 주기 변경 (60~3600초) |
| `/flight move <flight> <channel>` | 추적 스레드를 다른 채널로 이동 (새 스레드 생성 + 기존 스레드 보관) |
| `/flight mode <flight> <live\|log>` | 게시 방식 변경 |

`flight` 값에는 콜사인/편명(ICAO·IATA 모두 가능, 예: `KAL855` 또는 `KE855`), 등록번호(예: `N12345`,
`D-ABYD`), ICAO24 hex(예: `C2B571`) 중 무엇이든 넣을 수 있습니다.

자동 판별은 다음 규칙을 사용합니다: 6자리 순수 16진수 문자열은 hex로, `N12345`나 `D-ABYD`처럼
접두 표기가 뚜렷한 등록번호는 registration으로, 나머지는 모두 callsign(편명)으로 판별합니다.
`HL7612`, `JA1234`처럼 대시 없는 2글자 국가 접두 등록번호는 IATA 편명(예: `KE855`)과 글자 모양이
같아 자동으로 구분할 수 없으므로, 이런 경우 반드시 `type: registration` 옵션을 함께 지정하세요.

## 참고

- 아직 이륙하지 않은 편은 `대기 중`으로 표시되며 정상입니다.
- `신호 끊김`은 착륙을 의미하지 않습니다 (커버리지 공백일 수 있음) — 착륙은 지상(on-ground) 신호가
  실제로 잡혔을 때만 표시됩니다.
- 공개 ADS-B API는 과도한 요청 시 제한될 수 있으므로, 서버당 동시 추적 수와 최소 갱신 주기에
  제한이 있습니다 (`MAX_TRACKINGS_PER_GUILD`, `MIN_UPDATE_INTERVAL_SECONDS`).
