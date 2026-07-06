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

> [!IMPORTANT]
> **TypeScript 형식 준수 및 JSON 직렬화 이슈 해결**
> 소스코드 상에서 만료 시간 속성(`enableAtTimeMs`, `expireAtTimeMs`)의 타입은 `bigint`로 정의되어 있으나, Obsidian의 저장 메커니즘은 `JSON.stringify`를 사용합니다.
> JavaScript의 `JSON.stringify`는 `BigInt` 객체를 직렬화하지 못해 `TypeError: Do not know how to serialize a BigInt` 에러가 발생하여 플러그인이 먹통이 되었습니다.
> 이를 방지하기 위해 코드상에서는 `0 as unknown as bigint` 및 `4102444800000 as unknown as bigint`와 같이 **런타임 시점에는 일반 Number 타입으로 작동하되 컴파일러 통과만 허용하는 타입 캐스팅** 기법을 적용했습니다.

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
# 1. manifest.json 복사
cp .\manifest.json E:\personal\obsidian\Vault\.obsidian\plugins\remotely-save\

# 2. 빌드된 main.js 복사
cp .\main.js E:\personal\obsidian\Vault\.obsidian\plugins\remotely-save\
```

복사를 완료한 후, Obsidian 설정의 **커뮤니티 플러그인(Community Plugins)** 메뉴로 이동하여 `Remotely Save` 플러그인을 **비활성화 후 다시 활성화(Reload)** 하거나 Obsidian 앱을 재시작하면 변경 사항이 완벽히 적용됩니다.
