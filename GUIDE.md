# Remotely Save 플러그인 자체 커스텀 가이드북

이 문서는 Obsidian의 동기화 플러그인인 `Remotely Save`를 자체적으로 유지보수하고 커스텀하기 위한 개인 가이드라인입니다. 공식 개발이 중단됨에 따라 발생한 서버 인증 만료 문제를 해결한 내역과 빌드, 배포 방법 및 프로젝트 동작 메커니즘을 상세히 기록합니다.

---

## 1. 기본 동작 구조와 메커니즘

`Remotely Save` 플러그인은 Obsidian 노트 환경(웹브라우저와 유사한 Electron/모바일 환경)에서 로컬 파일과 지정된 클라우드 저장소 간의 상태를 비교하여 양방향 또는 단방향 동기화를 제공합니다.

### 1) 설정 관리 (`data.json`)
- 사용자의 동기화 대상 서비스, API 토큰, 암호화 비밀번호, 동기화 주기 등의 모든 민감 정보 및 제어 옵션은 Obsidian의 플러그인 폴더 내 `data.json` 파일에 저장됩니다.
- Obsidian은 플러그인이 로드될 때 이 설정을 메모리로 읽어 들이며, 설정이 변경될 때마다 `saveSettings()`를 통해 `data.json`으로 직렬화(`JSON.stringify`)하여 저장합니다.

### 2) PRO 기능 제약 및 라이선스 체크 구조
- **PRO 기능**: 스마트 충돌 해결(Smart Conflict), Google Drive 동기화, OneDrive(전체 권한), Box, pCloud, Yandex Disk, Koofr, Azure Blob Storage 등은 PRO 라이선스 활성화가 필요합니다.
- **체크 메커니즘**:
  - 원래 플러그인은 동기화를 시작할 때 `checkProRunnableAndFixInplace` 함수를 실행하여 활성화된 PRO 기능들의 만료 시간(`expireAtTimeMs`)을 검사합니다.
  - 이 만료 기간은 **최대 40일**로 제약되어 있어, 40일이 지나거나 만료일이 도래하면 공식 토큰 검증 서버(`https://remotelysave.com` 혹은 소스 코드 내의 빌드 변수 `${site}`가 가리키는 `https://remotely-save.github.io`)에 접속해 토큰과 활성 기능을 다시 갱신하도록 설계되어 있었습니다.

### 3) 클라우드 서비스 연동 방식
- **Dropbox & OneDrive (Free)**: 브라우저 인증 후 플러그인 내부의 OAuth 프로세스를 통해 직접 토큰을 획득합니다.
- **Google Drive 등 (PRO)**: 공식 인증 웹사이트를 중개하여 토큰을 발급받은 뒤 플러그인에 주입하여 연동합니다.

---

## 2. 변경된 내용 (PRO 서버 검증 우회)

공식 검증 서버가 비활성화되거나 잘못 설정(`https://remotely-save.github.io`로 리다이렉트되어 CORS 및 POST 405 에러 유발)되면서, 만료 기간 검사 단계에서 플러그인이 오작동하여 동기화 전체가 중단되는 현상이 발생했습니다. 이를 해결하기 위해 **완전 오프라인 PRO 활성화**를 구현하였습니다.

### 1) 변경 사항 요약
- **인터넷 검증 제거**: 검증 서버로 요청을 보내는 API 함수(`getAccessToken`, `getAndSaveProFeatures`, `getAndSaveProEmail`)를 무력화하고 항상 로컬에서 즉시 성공하도록 모킹(Mocking)했습니다.
- **만료 기한 및 기능 강제 활성화**:
  - 플러그인이 로드될 때 기존 설정에 PRO 만료일이 지난 기록이 있거나 아예 없는 경우, 모든 PRO 기능이 만료되지 않는 날짜(서기 2100년 1월 1일)로 설정되도록 재정의했습니다.
  - 동기화 시작 시 만료 기한을 확인하는 40일 루프 검사 코드를 제거하여 서버 연결을 완전히 방지했습니다.

### 2) 수정된 파일 상세

#### ① [pro/src/account.ts](file:///d:/workspace/40_private_project/obsidian_plugins/remotely-save/pro/src/account.ts)
- `DEFAULT_PRO_CONFIG`에 모든 PRO 기능과 만료일(2100년)을 기본값으로 할당했습니다.
- `getAccessToken`, `getAndSaveProFeatures`, `getAndSaveProEmail` 함수가 더 이상 `fetch` 요청을 보내지 않고 더미 데이터와 기능을 로컬에서 반환하도록 수정했습니다.
- `checkProRunnableAndFixInplace` 함수에서 40일 검사 및 자동 갱신 요청 루프를 지우고, 설정을 로컬 기준으로 강제 보정하도록 수정했습니다.

#### ② [src/main.ts](file:///d:/workspace/40_private_project/obsidian_plugins/remotely-save/src/main.ts)
- 플러그인이 초기화되는 `loadSettings` 시점에 기존 사용자의 `data.json` 내 `pro` 설정이 만료되었거나 비어있을 경우, 이를 2100년 만료일의 활성화 구조로 강제 덮어쓰기하여 저장하도록 보완했습니다.

#### ③ [src/fsDropbox.ts](file:///d:/workspace/40_private_project/obsidian_plugins/remotely-save/src/fsDropbox.ts)
- Dropbox SDK 호출 시 CORS 에러(특히 플러그인 삭제 시 실행되는 `delete_v2` 등)를 방지하기 위해, `Dropbox` 인스턴스 생성 시 `fetch: obsidianFetch` 옵션을 주입하였습니다. 이로 인해 모든 Dropbox 통신이 CORS 제한이 없는 Obsidian의 `requestUrl` API를 통해 이루어지게 됩니다.

> [!IMPORTANT]
> **TypeScript 형식 준수 및 JSON 직렬화 이슈 해결**
> 소스코드 상에서 만료 시간 속성(`enableAtTimeMs`, `expireAtTimeMs`)의 타입은 `bigint`로 정의되어 있으나, Obsidian의 저장 메커니즘은 `JSON.stringify`를 사용합니다.
> JavaScript의 `JSON.stringify`는 `BigInt` 객체를 직렬화하지 못해 `TypeError: Do not know how to serialize a BigInt` 에러가 발생하여 플러그인이 먹통이 되었습니다.
> 이를 방지하기 위해 코드상에서는 `0 as unknown as bigint` 및 `4102444800000 as unknown as bigint`와 같이 **런타임 시점에는 일반 Number 타입으로 작동하되 컴파일러 통과만 허용하는 타입 캐스팅** 기법을 적용했습니다.

---

## 2-1. iOS / iPadOS 전용 문제 해결 (`Load failed`)

### 1) 증상
PC(데스크톱)와 Android에서는 정상 동작하지만, iPad/iPhone의 옵시디언에서는 플러그인 로드까지는 되어도
동기화를 시작하는 즉시 중단되며 **`Load failed`** 라는 알림(Notice)만 뜹니다.

### 2) 원인
- 옵시디언 iOS 앱은 **WKWebView** 위에서 동작하며, 페이지의 origin이 `capacitor://` / `app://obsidian.md` 같은
  **커스텀 스킴**입니다. WebKit은 커스텀 스킴 origin에서 나가는 cross-origin `fetch()` 요청을 CORS 규칙에 따라 거부합니다.
- 이때 WebKit이 던지는 예외는 상태 코드가 없는 순수 `TypeError`이고, 그 `message`가 문자 그대로 **`Load failed`** 입니다.
  (Chromium 계열은 `Failed to fetch`, Firefox는 `NetworkError`)
- 데스크톱(Electron)과 Android(Chromium WebView)에는 이 제약이 없기 때문에 두 환경에서는 문제가 드러나지 않습니다.
- `src/main.ts`의 `errNotifyFunc`가 `error.message`를 그대로 Notice에 출력하므로, 사용자에게는 `Load failed`만 보이게 됩니다.
- 특히 Dropbox의 경우, 동기화 시작 시점의 `FakeFsDropbox._init()`에서 액세스 토큰이 만료되었으면
  `sendRefreshTokenReq()`가 **가장 먼저** 네이티브 `fetch`로 토큰 갱신을 시도합니다.
  (Dropbox 액세스 토큰 수명은 약 4시간이므로 사실상 매 동기화마다 호출됩니다.)
  이 호출이 iOS에서 즉시 실패하면서 "동기화 시작하자마자 멈춤" 증상이 나타납니다.

### 3) 수정 내용

#### ④ [src/obsFetch.ts](file:///d:/workspace/40_private_project/obsidian_plugins/remotely-save/src/obsFetch.ts) (신규)
기존에 `src/fsDropbox.ts` 안에 있던 `obsidianFetch`를 공용 모듈로 분리하고 다음 세 가지를 제공합니다.
- `obsidianFetch`: 옵시디언의 네이티브 `requestUrl` API를 `fetch` 인터페이스로 감싼 래퍼. CORS 제약을 받지 않습니다.
- `platformSafeFetch`: **iOS/iPadOS(`Platform.isIosApp`)에서만** `obsidianFetch`를 사용하고,
  그 외 환경에서는 기존과 동일하게 네이티브 `fetch`를 사용합니다.
  (이미 정상 동작 중인 데스크톱/Android 경로를 건드리지 않기 위한 조건부 분기입니다.
  커밋 `74691aa`에서 Android 호환성 때문에 네이티브 `fetch`로 되돌렸던 결정을 그대로 존중합니다.)
- `isNetworkLoadError`: `Load failed` / `Failed to fetch` / `NetworkError` 등 **HTTP 상태 코드가 없는 저수준 네트워크 실패**를
  엔진에 상관없이 판별합니다.

#### ⑤ [src/fsDropbox.ts](file:///d:/workspace/40_private_project/obsidian_plugins/remotely-save/src/fsDropbox.ts)
- `sendAuthReq`(최초 OAuth 로그인)와 `sendRefreshTokenReq`(토큰 자동 갱신)의 `fetch`를 `platformSafeFetch`로 교체했습니다.
  → iOS에서 동기화 시작 직후 발생하던 `Load failed`의 직접적인 원인이 제거됩니다.
- `retryReq`의 네트워크 실패 판별 로직을 `isNetworkLoadError`로 교체했습니다.
- `obsidianFetch` 구현체는 `src/obsFetch.ts`로 이동했고, 기존 import 호환을 위해 재export만 남겨두었습니다.

#### ⑥ [src/fsOnedrive.ts](file:///d:/workspace/40_private_project/obsidian_plugins/remotely-save/src/fsOnedrive.ts)
- 업로드 경로(`_putArrayBuffer`, `_putUint8ArrayByRange`)와 `_deleteJson`의 네이티브 `fetch`를 `platformSafeFetch`로 교체했습니다.
  이 지점들은 주석대로 "Android의 base64 이슈" 때문에 `if (false /*VALID_REQURL*/)`로 `requestUrl`이 꺼져 있어
  iOS에서도 동일하게 CORS 벽에 부딪히던 곳입니다.
- 다운로드 경로는 이미 `catch`에서 `requestUrl`로 재시도하는 폴백이 있어 그대로 두었습니다.

> [!NOTE]
> **`JSON.stringify(error)`로는 네트워크 에러를 잡을 수 없습니다.**
> `Error` 객체의 `name`/`message`는 열거 가능(enumerable) 속성이 아니어서 `JSON.stringify(new TypeError("Load failed"))`의
> 결과는 `"{}"` 입니다. 기존 `retryReq`의 `errStr.includes("failed to fetch")` 검사가 실제로는 한 번도 매칭되지 않았던 이유입니다.
> 그래서 `isNetworkLoadError`는 `err.name`, `err.message`, `String(err)`를 직접 확인합니다.
> 반대로 `DropboxResponseError`는 `status`/`headers`/`error`를 생성자에서 대입하므로 `JSON.stringify`로 직렬화됩니다.
> (409 재시도 판별은 `JSON.stringify(err.error)` 기준으로 되돌렸습니다.)

> [!WARNING]
> **`src/fsWebdis.ts`는 의도적으로 제외했습니다.**
> `tests/fsWebdis.test.ts`가 이 모듈을 Node에서 직접 import하는데, `obsidian` 모듈은 Node 환경에서 해석되지 않아
> 테스트 전체가 `MODULE_NOT_FOUND`로 깨집니다. Webdis에도 적용하려면 테스트를 먼저 분리해야 합니다.
> 마찬가지로 `pro/src/` 아래의 서비스들(Google Drive, Box, pCloud, Yandex, Koofr)에도 동일한 네이티브 `fetch` 패턴이
> 남아 있으므로, 해당 서비스를 iOS에서 쓰려면 같은 방식의 치환이 추가로 필요합니다.

---

## 3. 빌드 방법

프로젝트 빌드는 Webpack을 사용하는 프로덕션 빌드 방식을 권장합니다.

```bash
# 의존성 패키지 설치 (최초 1회 또는 package.json 변경 시)
npm install

# Webpack을 이용한 프로덕션 빌드 (main.js 생성)
npm run build
```

> [!NOTE]
> `package.json`에 `esbuild` 관련 빌드 스크립트(`build2`)도 있으나, 일부 의존 라이브러리(`@aws-sdk/crc64-nvme` 등)에서 사용하는 BigInt 구문 및 Node.js 내장 모듈 처리 방식으로 인해 `esbuild` 실행 시 번들링 오류가 발생할 수 있습니다. **안정적인 Webpack 빌드(`npm run build`)**를 사용해 주십시오.

### 테스트 실행
코드 수정 후 로직 오류 여부는 아래 명령어를 수행하여 72개의 단위 테스트를 통과하는지 확인할 수 있습니다.
```bash
npm run test
```

---

## 4. 배포 및 옵시디언 적용 방법

빌드가 성공적으로 끝나면 프로젝트 루트에 최신 `main.js` 파일이 생성됩니다. 이 파일과 `manifest.json` 파일을 본인의 Obsidian Vault 플러그인 디렉토리에 덮어씌워 적용합니다.

### 배포 명령어 (PowerShell 기준)

PowerShell 터미널을 열고 프로젝트 루트 디렉토리에서 아래 명령어를 순서대로 실행합니다.

```powershell
$dst = "E:\personal\obsidian\Vault\.obsidian\plugins\remotely-save"

# 1. manifest.json 복사
Copy-Item .\manifest.json $dst -Force

# 2. 빌드된 main.js 복사
Copy-Item .\main.js $dst -Force

# 3. styles.css 복사
Copy-Item .\styles.css $dst -Force
```

> [!CAUTION]
> 플러그인 폴더의 `data.json`은 **사용자의 실제 설정과 클라우드 토큰**이 들어 있는 파일입니다. 절대 덮어쓰지 마십시오.
> 복사 대상은 `main.js`, `manifest.json`, `styles.css` 세 개뿐입니다.

> [!NOTE]
> 과거 webpack이 번들을 분할하던 시절의 잔재로 플러그인 폴더에 `274.main.js` 같은 청크 파일이 남아 있을 수 있습니다.
> 현재는 `LimitChunkCountPlugin(maxChunks: 1)`으로 `main.js` 하나만 생성되므로, 남아 있는 청크 파일은 로드되지 않는 사용하지 않는 파일입니다. 지워도 무방합니다.

복사를 완료한 후, Obsidian 설정의 **커뮤니티 플러그인(Community Plugins)** 메뉴로 이동하여 `Remotely Save` 플러그인을 **비활성화 후 다시 활성화(Reload)** 하거나 Obsidian 앱을 재시작하면 변경 사항이 완벽히 적용됩니다.

---

## 5. GitHub 자동 빌드 및 릴리스

태그를 푸시하면 GitHub Actions가 빌드·테스트·릴리스까지 자동으로 수행합니다.
워크플로 정의는 [.github/workflows/release.yml](file:///d:/workspace/40_private_project/obsidian_plugins/remotely-save/.github/workflows/release.yml)에 있습니다.

### 1) 최초 1회 준비 (GitHub 웹에서 직접 수행)

포크한 저장소는 **워크플로 실행 권한과 시크릿을 상속받지 않으므로** 아래 두 가지를 먼저 설정해야 합니다.

1. **Actions 활성화**
   저장소의 `Actions` 탭 → *"I understand my workflows, go ahead and enable them"* 버튼 클릭.
   (포크 저장소는 기본적으로 워크플로 실행이 꺼져 있습니다.)

2. **리포지토리 시크릿 등록 (선택 사항)**
   `Settings` → `Secrets and variables` → `Actions` → `New repository secret`.
   로컬 `.env`에 있는 값을 그대로 넣으면 됩니다. **없어도 릴리스는 정상적으로 만들어지며**, 워크플로는 경고만 남깁니다.

   | 시크릿 이름 | 없을 때의 영향 |
   | --- | --- |
   | `DROPBOX_APP_KEY` | 신규 설치/재인증 시 Dropbox 인증 불가 |
   | `ONEDRIVE_CLIENT_ID`, `ONEDRIVE_AUTHORITY` | OneDrive 신규 인증 불가 |
   | `GOOGLEDRIVE_CLIENT_ID`, `GOOGLEDRIVE_CLIENT_SECRET` | Google Drive 신규 인증 불가 |
   | `REMOTELYSAVE_WEBSITE`, `REMOTELYSAVE_CLIENT_ID` | 없어도 무방(PRO 검증은 오프라인 우회됨) |
   | `BOX_*`, `PCLOUD_*`, `YANDEXDISK_*`, `KOOFR_*` | 해당 서비스 신규 인증 불가 |

#### OAuth 키가 실제로 흘러가는 경로

```
.env / GitHub Secret → webpack.DefinePlugin → global.DEFAULT_DROPBOX_APP_KEY
                     → src/baseTypes.ts (DROPBOX_APP_KEY)
                     → src/fsDropbox.ts (DEFAULT_DROPBOX_CONFIG.clientID)
```

- 플러그인 **설정 화면에는 app key 입력란이 없습니다.** 설정의 입력란(`modal_dropboxauth_maualinput`)은
  브라우저 인증 후 받는 **인증 코드(auth code)**를 붙여넣는 자리이며, app key는 그 코드를 토큰으로 교환할 때
  `client_id`로 함께 전송되는 값입니다. 즉 **빌드 시점에 `main.js`에 인라인**됩니다.
- 다만 `src/main.ts`의 `loadSettings`는 저장된 값이 **비어 있을 때만** 빌드 상수로 채웁니다.

  ```ts
  if (this.settings.dropbox.clientID === "") {
    this.settings.dropbox.clientID = DEFAULT_SETTINGS.dropbox.clientID;
  }
  ```

  그리고 토큰 갱신도 `FakeFsDropbox._init()`에서 `sendRefreshTokenReq(this.dropboxConfig.clientID, ...)`로
  **`data.json`에 저장된 값**을 사용합니다.

> [!NOTE]
> 결론적으로 **이미 인증을 마친 vault는 시크릿 없이 빌드한 `main.js`로도 정상 동작합니다.**
> `data.json`에 `clientID`가 이미 들어 있기 때문입니다.
> 시크릿이 실제로 필요한 경우는 ① 새 기기/새 vault에 처음 설치할 때, ② Revoke 후 재인증할 때 두 가지뿐입니다.
> 그래서 워크플로는 키가 없어도 실패시키지 않고 경고와 Job Summary만 남깁니다.

> [!CAUTION]
> Dropbox app key는 PKCE 공개 클라이언트 식별자라 원래 클라이언트에 노출되는 값이지만,
> **public 저장소의 릴리스에 넣으면 누구나 추출할 수 있고 본인 Dropbox 앱의 API 쿼터를 공유하게 됩니다.**
> 개인용 포크라면 시크릿을 등록하지 않고, 기기마다 최초 1회만 인증된 `data.json`을 사용하는 편이 안전합니다.

### 2) 릴리스 방법

```bash
git tag 0.5.26            # v0.5.26 처럼 앞에 v를 붙여도 됩니다 (자동으로 제거)
git push origin 0.5.26
```

태그가 푸시되면 워크플로가 순서대로 다음을 수행합니다.

1. 태그명에서 버전을 추출합니다 (`v` 접두사는 제거).
2. `manifest.json`, `manifest-beta.json`, `package.json`의 `version`을 **태그와 일치하도록 덮어씁니다.**
   (옵시디언과 BRAT은 `manifest.version`과 릴리스 태그가 정확히 같아야 인식합니다. CI 작업 공간에서만 수정하며 저장소에는 커밋하지 않습니다.)
3. LFS 파일을 포함해 체크아웃합니다. `*.svg`가 LFS로 관리되는데 webpack이 이를 `asset/source`로 인라인하므로,
   포인터가 해석되지 않으면 아이콘 자리에 포인터 텍스트가 박힌 `main.js`가 만들어집니다.
4. `npm install` → `npm test` → `npm run build`
5. **빌드 산출물을 검증합니다.** `main.js` 존재 여부와 크기, 그리고 `274.main.js` 같은 **추가 청크가 생기지 않았는지**를 확인합니다.
   청크가 분할되면 모바일에서 플러그인이 로드되지 않기 때문입니다 (커밋 `f9cf829` 참고).
6. `main.js` / `manifest.json` / `styles.css` 와, 수동 설치용 `remotely-save-<버전>.zip`을 릴리스에 첨부합니다.

### 3) 재실행

빌드 실패 등으로 다시 돌려야 한다면 태그를 새로 만들 필요 없이
`Actions` → `Release A New Version` → `Run workflow`에서 태그명을 입력해 다시 실행할 수 있습니다.

### 4) 태그 삭제 (잘못 올렸을 때)

```bash
git push origin --delete 0.5.26   # 원격 태그 삭제
git tag -d 0.5.26                 # 로컬 태그 삭제
```
릴리스는 GitHub 웹의 `Releases` 화면에서 따로 삭제해야 합니다.
