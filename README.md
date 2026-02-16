# JJTT Donation Webhook Server

## 파일 구조
```
jjtt-webhook/
├── api/
│   ├── webhook.js   ← 카페24 Webhook 수신
│   └── status.js    ← 기부현황 데이터 제공
├── package.json
├── vercel.json
└── supabase_functions.sql
```

## 배포 순서

### 1. Supabase 함수 등록
supabase_functions.sql 내용을 Supabase SQL Editor에서 실행

### 2. GitHub 업로드
이 폴더 전체를 GitHub 새 레포지토리에 업로드

### 3. Vercel 배포
1. https://vercel.com 접속 → GitHub 로그인
2. New Project → GitHub 레포 선택
3. Environment Variables 추가:
   - SUPABASE_URL = https://xxxxxxxx.supabase.co
   - SUPABASE_SECRET_KEY = sb_secret_...
4. Deploy 클릭

### 4. 배포 완료 후 URL 확인
- Webhook URL: https://your-project.vercel.app/api/webhook
- Status URL:  https://your-project.vercel.app/api/status

### 5. 카페24 Webhook 등록
카페24 관리자 → 앱 → Webhook → 주문 완료 이벤트에 Webhook URL 등록

### 6. donation_cafe24.html 수정
SUPABASE_URL을 실제 Vercel Status URL로 교체
