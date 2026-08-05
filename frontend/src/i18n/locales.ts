/**
 * 화면 언어별 문자열 사전이다.
 *
 * 백엔드 `preferredLanguage` enum(KOREAN·ENGLISH)과 짝이 맞도록 두 언어만 둔다.
 * 키는 `영역.용도` 형태로 짓고, 한국어 사전이 **기준(fallback)**이다. 영어 사전에 키가 없으면
 * useTranslation이 한국어 문장을 그대로 내보내므로, 번역이 밀려도 화면이 비지 않는다.
 *
 * 새 문자열을 추가할 때는 ko에 먼저 넣는다. `TranslationKey` 타입이 ko를 기준으로 만들어져
 * en에서 키를 빠뜨리면 타입 오류로 잡히지 않지만(부분 사전 허용), ko에 없는 키를 쓰면 잡힌다.
 */
export const SUPPORTED_LOCALES = ['ko', 'en'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** 언어 선택기에 노출할 이름이다. 각 언어를 그 언어로 적어 스스로 찾을 수 있게 한다. */
export const LOCALE_LABELS: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
}

/** `<html lang>`에 넣을 값이다. */
export const LOCALE_HTML_LANG: Record<Locale, string> = {
  ko: 'ko',
  en: 'en',
}

const ko = {
  // 공용 셸 — 헤더·네비게이션
  'nav.ariaLabel': '주요 메뉴',
  'nav.skipToContent': '본문으로 건너뛰기',
  'nav.openMenu': '메뉴 열기',
  'nav.closeMenu': '메뉴 닫기',
  'nav.fan.events': '이벤트',
  'nav.fan.mypage': '마이페이지',
  'nav.influencer.meetings': '내 팬미팅',
  'nav.influencer.fans': '내 팬',
  'nav.influencer.mypage': '마이페이지',
  'nav.manager.meetings': '팬미팅 관리',
  'nav.manager.organization': '조직 관리',
  'nav.manager.mypage': '마이페이지',
  'nav.notifications': '알림',

  // 언어 선택기
  'language.label': '언어',
  'language.change': '화면 언어 변경',

  // 로그인
  'login.eyebrow': 'MELLY FAN MEETING',
  'login.heading': '다시 만나서 반가워요',
  'login.lead': '로그인하고 좋아하는 인플루언서의 이벤트와 신청한 팬미팅을 확인해 보세요.',
  'login.formTitle': '로그인',
  'login.formLead': 'MELLY 계정 정보를 입력해 주세요.',
  'login.noticeTitle': '안내',
  'login.loginId': '아이디',
  'login.loginIdPlaceholder': '아이디를 입력해 주세요',
  'login.password': '비밀번호',
  'login.passwordPlaceholder': '비밀번호를 입력해 주세요',
  'login.showPassword': '비밀번호 보기',
  'login.hidePassword': '비밀번호 숨기기',
  'login.forgotPasswordPending': '비밀번호 찾기 준비 중',
  'login.forgotPasswordTitle': '비밀번호 재설정 API가 제공되면 사용할 수 있습니다.',
  'login.submit': '로그인',
  'login.submitting': '로그인 중',
  'login.fillBoth': '아이디와 비밀번호를 입력해 주세요.',
  'login.socialDivider': '또는 소셜 계정으로',
  'login.noAccount': '아직 MELLY 계정이 없나요?',
  'login.goSignup': '회원가입',
  'login.failed': '로그인 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',

  // 회원가입
  'signup.heading': 'MELLY에서 팬미팅을 시작해 보세요',
  'signup.lead': '계정을 만들고 좋아하는 인플루언서의 이벤트와 팬미팅에 참여할 수 있어요.',
  'signup.formTitle': '회원가입',
  'signup.formLead': '아래 정보를 입력해 MELLY 계정을 만들어 주세요.',
  'signup.requiredNote': '표시는 필수 입력 항목입니다.',
  'signup.email': '이메일',
  'signup.loginId': '아이디',
  'signup.loginIdPlaceholder': '아이디를 입력해 주세요',
  'signup.nickname': '닉네임',
  'signup.nicknamePlaceholder': '닉네임을 입력해 주세요',
  'signup.password': '비밀번호',
  'signup.passwordPlaceholder': '비밀번호를 입력해 주세요',
  'signup.passwordHint': '영문과 숫자를 조합해 8자 이상 입력해 주세요.',
  'signup.passwordConfirm': '비밀번호 확인',
  'signup.passwordConfirmPlaceholder': '비밀번호를 다시 입력해 주세요',
  'signup.language': '선호 언어',
  'signup.languagePlaceholder': '언어를 선택해 주세요',
  'signup.role': '역할',
  'signup.agreeTerms': '이용약관에 동의합니다.',
  'signup.agreePrivacy': '개인정보 처리방침에 동의합니다.',
  'signup.viewPolicy': '내용 보기',
  'signup.submit': '회원가입',
  'signup.submitting': '가입 처리 중',
  'signup.allValid': '입력이 모두 확인되었습니다.',
  'signup.fillRequired': '필수 항목을 모두 입력하면 가입할 수 있어요.',
  'signup.hasAccount': '이미 계정이 있나요?',
  'signup.goLogin': '로그인',
  'signup.failed': '회원가입 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',

  // 회원가입 입력 검증
  'signup.error.email': '이메일을 입력해 주세요.',
  'signup.error.emailFormat': '올바른 이메일 형식을 입력해 주세요.',
  'signup.error.loginId': '아이디를 입력해 주세요.',
  'signup.error.nickname': '닉네임을 입력해 주세요.',
  'signup.error.password': '비밀번호를 입력해 주세요.',
  'signup.error.passwordRule': '영문과 숫자를 포함해 8자 이상 입력해 주세요.',
  'signup.error.passwordConfirm': '비밀번호를 다시 입력해 주세요.',
  'signup.error.passwordMismatch': '비밀번호가 일치하지 않습니다.',
  'signup.error.language': '선호 언어를 선택해 주세요.',
  'signup.error.role': '역할을 선택해 주세요.',
  'signup.error.terms': '필수 약관에 동의해 주세요.',

  // 회원가입 역할 선택
  'signup.role.fan': '팬',
  'signup.role.fan.note': '좋아하는 크리에이터의 이벤트에 응모하고 1:1 영상 팬미팅에 참여합니다.',
  'signup.role.influencer': '인플루언서',
  'signup.role.influencer.note':
    '소속 조직의 매니저가 만든 팬미팅을 진행합니다. 가입 후 조직 초대를 받아 합류하세요.',
  'signup.role.soloInfluencer': '1인 인플루언서',
  'signup.role.soloInfluencer.note': '소속 조직 없이 팬미팅을 직접 만들고 진행합니다.',
  'signup.role.manager': '매니저',
  'signup.role.manager.note': '조직을 만들고 인플루언서를 초대해 팬미팅 운영을 관리합니다.',

  // 회원가입 직후 이메일 인증 단계
  'signup.verify.heading': '가입이 완료되었어요',
  'signup.verify.lead': '마지막으로 이메일 인증만 마치면 바로 로그인할 수 있어요.',
  'signup.verify.later': '나중에 인증하고 로그인하러 가기',
  'signup.verify.done': '이메일 인증이 완료되었어요. 이제 로그인해 주세요.',

  // 팬 — 이벤트 목록
  'fanEvents.heading': '열려 있는 이벤트',
  'fanEvents.lead': '응모 마감이 가까운 순서로 보여드려요.',
  'fanEvents.search.label': '검색',
  'fanEvents.search.placeholder': '이벤트명 또는 인플루언서명',
  'fanEvents.search.submit': '검색',
  'fanEvents.status.label': '모집 상태',
  'fanEvents.status.all': '전체',
  'fanEvents.status.published': '모집 예정',
  'fanEvents.status.open': '모집 중',
  'fanEvents.status.ready': '결과 발표',
  'fanEvents.date.label': '날짜',
  'fanEvents.date.all': '전체 날짜',
  'fanEvents.date.today': '오늘',
  'fanEvents.date.thisWeek': '이번 주',
  'fanEvents.date.nextWeek': '다음 주',
  'fanEvents.date.thisMonth': '이번 달',
  'fanEvents.date.nextMonth': '다음 달',
  'fanEvents.influencer.label': '인플루언서',
  'fanEvents.influencer.placeholder': '인플루언서명',
  'fanEvents.loadFailed': '팬미팅 목록을 불러오지 못했습니다.',
  'fanEvents.error.title': '팬미팅 목록을 표시할 수 없습니다',
  'fanEvents.loading': '팬미팅 목록을 불러오는 중',
  'fanEvents.empty.title': '조건에 맞는 팬미팅이 없어요',
  'fanEvents.empty.description': '검색 조건을 바꾸면 다른 팬미팅을 볼 수 있어요.',
  'fanEvents.count': '{count}개',
  'fanEvents.card.noImageAria': '대표 이미지가 등록되지 않은 이벤트',
  'fanEvents.card.noImage': '이미지 없음',
  'fanEvents.card.dday': '마감 D-{days}',
  'fanEvents.card.influencer': '인플루언서 {name}',
  'fanEvents.card.applyStart': '응모 시작 {date}',
  'fanEvents.card.applyEnd': '응모 마감 {date}',

  // 팬 — 이벤트 상세·응모
  'fanEvent.invalid.title': '이벤트 정보가 없습니다',
  'fanEvent.invalid.message': '올바른 이벤트를 선택해 주세요.',
  'fanEvent.loading': '이벤트 상세 정보를 불러오는 중',
  'fanEvent.error.title': '이벤트 정보를 표시할 수 없습니다',
  'fanEvent.error.notFound': '해당 이벤트를 찾을 수 없습니다.',
  'fanEvent.error.detailLoad': '이벤트 상세 정보를 불러오지 못했습니다.',
  'fanEvent.sectionAria': '이벤트 개요 및 응모',
  'fanEvent.coverAlt': '{title} 대표 이미지',
  'fanEvent.noImageAria': '대표 이미지가 등록되지 않은 이벤트',
  'fanEvent.noImage': '이미지 없음',
  'fanEvent.influencer': '인플루언서 {name}',
  'fanEvent.schedule': '{date} · 1:1 영상통화 {duration}',
  'fanEvent.badge.applied': '응모 완료',
  'fanEvent.badge.closed': '모집 마감',
  'fanEvent.badge.open': '모집 중 · {date}까지',

  // 응모 질문
  'fanEvent.form.error.title': '응모 질문을 불러오지 못했습니다',
  'fanEvent.form.error.load': '응모 질문을 불러오지 못했습니다.',
  'fanEvent.form.reload': '질문 다시 불러오기',
  'fanEvent.form.loading': '응모 질문을 불러오는 중',
  'fanEvent.form.loadingText': '응모 질문을 불러오는 중입니다.',
  'fanEvent.form.required': ' (필수)',

  // 응모 동의
  'fanEvent.agree.title': '응모 동의',
  'fanEvent.agree.privacy': '개인정보 수집·이용 동의',
  'fanEvent.agree.recording': '영상통화 녹화 동의',
  'fanEvent.agree.participation': '응모 규칙 및 참여 조건 동의',
  'fanEvent.agree.requiredBadge': '필수',

  // 응모 버튼·안내
  'fanEvent.submit': '응모하기',
  'fanEvent.helper.notOpen': '응모 기간이 아닙니다.',
  'fanEvent.helper.formLoading': '응모 질문을 불러오는 중입니다.',
  'fanEvent.helper.formError': '응모 질문을 확인한 뒤 다시 시도해 주세요.',
  'fanEvent.helper.allAgreed': '필수 동의를 모두 완료했어요.',
  'fanEvent.helper.needAgree': '필수 항목 {count}개에 모두 동의해야 응모할 수 있어요.',

  // 응모 접수 완료
  'fanEvent.applied.title': '응모가 접수됐어요',
  'fanEvent.applied.withResult':
    '결과는 {date}에 발표됩니다. 진행 상태는 마이페이지 응모 내역에서 볼 수 있어요.',
  'fanEvent.applied.withoutResult': '진행 상태는 마이페이지 응모 내역에서 볼 수 있어요.',
  'fanEvent.applied.withdrawDeadline': '취소 가능 기한',
  'fanEvent.applied.myApplications': '마이페이지 응모 내역',
  'fanEvent.applied.withdraw': '응모 취소',

  // 응모 실패·마감
  'fanEvent.failed.title': '응모를 완료하지 못했어요',
  'fanEvent.failed.retry': '다시 응모하기',
  'fanEvent.closed.title': '모집이 마감됐어요',
  'fanEvent.closed.description': '이번 팬미팅의 응모는 종료되었습니다.',
  'fanEvent.closed.cta': '모집 마감',
  'fanEvent.closed.next': '다음 팬미팅 보기',

  // 상세 본문
  'fanEvent.about': '이번 팬미팅은',
  'fanEvent.scheduleAria': '응모 일정',
  'fanEvent.applicationEnd': '응모 마감',
  'fanEvent.resultAnnounce': '결과 발표',
  'fanEvent.capacity': '{count}명 모집',
  'fanEvent.conditions': '참여 조건',
  'fanEvent.condition.identity': '본인 명의 계정 및 장비 점검 완료',
  'fanEvent.condition.waitingRoom': '팬미팅 시작 전 대기실 입장',
  'fanEvent.cautions': '유의사항',
  'fanEvent.caution.recordingKept': '녹화 영상은 팬미팅 후 5일 동안 보관됩니다',
  'fanEvent.caution.noRecording': '이 팬미팅은 영상통화를 녹화하지 않습니다',
  'fanEvent.caution.moderation': '부적절한 상황 발생 시 운영자 조치가 있을 수 있습니다',

  // 응모 확인 대화상자
  'fanEvent.confirm.title': '이 팬미팅에 응모할까요?',
  'fanEvent.confirm.description': '{date}까지 마이페이지에서 취소할 수 있어요.',
  'fanEvent.confirm.cancel': '취소',
  'fanEvent.confirm.ok': '확인',

  // 응모 처리 오류
  'fanEvent.submit.needLogin': '응모하려면 먼저 로그인해 주세요.',
  'fanEvent.submit.checkForm': '응모 질문을 확인한 뒤 다시 시도해 주세요.',
  'fanEvent.submit.missingRequired': '필수 질문에 답변해 주세요: {questions}',
  'fanEvent.submit.needEmailVerify': '이메일 인증을 완료한 뒤 응모할 수 있어요.',
  'fanEvent.submit.sessionExpired': '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  'fanEvent.submit.fanOnly': '팬 계정으로 로그인해야 응모할 수 있습니다.',
  'fanEvent.submit.deviceDuplicate':
    '같은 환경에서 다른 계정의 응모 이력이 확인되어 접수할 수 없습니다. 본인 계정이 맞다면 운영팀에 문의해 주세요.',
  'fanEvent.submit.alreadyApplied': '이미 응모한 이벤트입니다.',
  'fanEvent.submit.tooManyRequests': '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
  'fanEvent.submit.failed': '응모 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',

  // 응모 취소
  'fanEvent.withdraw.needLogin': '응모를 취소하려면 먼저 로그인해 주세요.',
  'fanEvent.withdraw.confirm': '응모를 취소할까요? 응모 기간 안에는 다시 응모할 수 있어요.',
  'fanEvent.withdraw.notAllowed': '지금은 응모를 취소할 수 있는 기간이 아닙니다.',
  'fanEvent.withdraw.failed': '응모 취소 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
} as const

/** 사전 키다. 한국어 사전에 있는 키만 쓸 수 있다. */
export type TranslationKey = keyof typeof ko

/** 영어 사전은 부분 번역을 허용한다. 빠진 키는 한국어 문장으로 대체된다. */
const en: Partial<Record<TranslationKey, string>> = {
  'nav.ariaLabel': 'Main menu',
  'nav.skipToContent': 'Skip to content',
  'nav.openMenu': 'Open menu',
  'nav.closeMenu': 'Close menu',
  'nav.fan.events': 'Events',
  'nav.fan.mypage': 'My page',
  'nav.influencer.meetings': 'My fan meetings',
  'nav.influencer.fans': 'My fans',
  'nav.influencer.mypage': 'My page',
  'nav.manager.meetings': 'Fan meetings',
  'nav.manager.organization': 'Organization',
  'nav.manager.mypage': 'My page',
  'nav.notifications': 'Notifications',

  'language.label': 'Language',
  'language.change': 'Change display language',

  'login.eyebrow': 'MELLY FAN MEETING',
  'login.heading': 'Good to see you again',
  'login.lead':
    'Sign in to check events from your favorite influencers and the fan meetings you applied for.',
  'login.formTitle': 'Sign in',
  'login.formLead': 'Enter your MELLY account details.',
  'login.noticeTitle': 'Notice',
  'login.loginId': 'ID',
  'login.loginIdPlaceholder': 'Enter your ID',
  'login.password': 'Password',
  'login.passwordPlaceholder': 'Enter your password',
  'login.showPassword': 'Show password',
  'login.hidePassword': 'Hide password',
  'login.forgotPasswordPending': 'Password reset coming soon',
  'login.forgotPasswordTitle': 'Available once the password reset API is provided.',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in',
  'login.fillBoth': 'Enter your ID and password.',
  'login.socialDivider': 'Or continue with',
  'login.noAccount': "Don't have a MELLY account yet?",
  'login.goSignup': 'Sign up',
  'login.failed': 'Could not process the sign-in request. Please try again shortly.',

  'signup.heading': 'Start fan meetings on MELLY',
  'signup.lead':
    'Create an account to join events and fan meetings from your favorite influencers.',
  'signup.formTitle': 'Sign up',
  'signup.formLead': 'Fill in the details below to create your MELLY account.',
  'signup.requiredNote': 'marks a required field.',
  'signup.email': 'Email',
  'signup.loginId': 'ID',
  'signup.loginIdPlaceholder': 'Enter an ID',
  'signup.nickname': 'Nickname',
  'signup.nicknamePlaceholder': 'Enter a nickname',
  'signup.password': 'Password',
  'signup.passwordPlaceholder': 'Enter a password',
  'signup.passwordHint': 'Use at least 8 characters with letters and numbers.',
  'signup.passwordConfirm': 'Confirm password',
  'signup.passwordConfirmPlaceholder': 'Re-enter your password',
  'signup.language': 'Preferred language',
  'signup.languagePlaceholder': 'Select a language',
  'signup.role': 'Role',
  'signup.agreeTerms': 'I agree to the Terms of Service.',
  'signup.agreePrivacy': 'I agree to the Privacy Policy.',
  'signup.viewPolicy': 'View',
  'signup.submit': 'Sign up',
  'signup.submitting': 'Creating account',
  'signup.allValid': 'All inputs look good.',
  'signup.fillRequired': 'Complete every required field to sign up.',
  'signup.hasAccount': 'Already have an account?',
  'signup.goLogin': 'Sign in',
  'signup.failed': 'Could not process the sign-up request. Please try again shortly.',

  'signup.error.email': 'Enter your email.',
  'signup.error.emailFormat': 'Enter a valid email address.',
  'signup.error.loginId': 'Enter an ID.',
  'signup.error.nickname': 'Enter a nickname.',
  'signup.error.password': 'Enter a password.',
  'signup.error.passwordRule': 'Use at least 8 characters with letters and numbers.',
  'signup.error.passwordConfirm': 'Re-enter your password.',
  'signup.error.passwordMismatch': 'Passwords do not match.',
  'signup.error.language': 'Select your preferred language.',
  'signup.error.role': 'Select a role.',
  'signup.error.terms': 'Agree to the required policies.',

  'signup.role.fan': 'Fan',
  'signup.role.fan.note':
    'Apply to events from creators you love and join 1:1 video fan meetings.',
  'signup.role.influencer': 'Influencer',
  'signup.role.influencer.note':
    'Host fan meetings created by your organization manager. Join via an invitation after signing up.',
  'signup.role.soloInfluencer': 'Solo influencer',
  'signup.role.soloInfluencer.note':
    'Create and host your own fan meetings without an organization.',
  'signup.role.manager': 'Manager',
  'signup.role.manager.note':
    'Create an organization, invite influencers, and manage fan meeting operations.',

  'signup.verify.heading': 'Your account is ready',
  'signup.verify.lead': 'Verify your email and you can sign in right away.',
  'signup.verify.later': 'Verify later and go to sign in',
  'signup.verify.done': 'Email verified. Please sign in.',

  'fanEvents.heading': 'Open events',
  'fanEvents.lead': 'Sorted by the closest application deadline.',
  'fanEvents.search.label': 'Search',
  'fanEvents.search.placeholder': 'Event or influencer name',
  'fanEvents.search.submit': 'Search',
  'fanEvents.status.label': 'Status',
  'fanEvents.status.all': 'All',
  'fanEvents.status.published': 'Opening soon',
  'fanEvents.status.open': 'Open now',
  'fanEvents.status.ready': 'Results announced',
  'fanEvents.date.label': 'Date',
  'fanEvents.date.all': 'All dates',
  'fanEvents.date.today': 'Today',
  'fanEvents.date.thisWeek': 'This week',
  'fanEvents.date.nextWeek': 'Next week',
  'fanEvents.date.thisMonth': 'This month',
  'fanEvents.date.nextMonth': 'Next month',
  'fanEvents.influencer.label': 'Influencer',
  'fanEvents.influencer.placeholder': 'Influencer name',
  'fanEvents.loadFailed': 'Could not load the fan meeting list.',
  'fanEvents.error.title': 'Cannot display the fan meeting list',
  'fanEvents.loading': 'Loading fan meetings',
  'fanEvents.empty.title': 'No fan meetings match your filters',
  'fanEvents.empty.description': 'Try different filters to see other fan meetings.',
  'fanEvents.count': '{count} events',
  'fanEvents.card.noImageAria': 'Event without a cover image',
  'fanEvents.card.noImage': 'No image',
  'fanEvents.card.dday': 'D-{days} left',
  'fanEvents.card.influencer': 'Influencer {name}',
  'fanEvents.card.applyStart': 'Opens {date}',
  'fanEvents.card.applyEnd': 'Closes {date}',

  'fanEvent.invalid.title': 'Event not found',
  'fanEvent.invalid.message': 'Please choose a valid event.',
  'fanEvent.loading': 'Loading event details',
  'fanEvent.error.title': 'Cannot display this event',
  'fanEvent.error.notFound': 'This event could not be found.',
  'fanEvent.error.detailLoad': 'Could not load the event details.',
  'fanEvent.sectionAria': 'Event overview and application',
  'fanEvent.coverAlt': '{title} cover image',
  'fanEvent.noImageAria': 'Event without a cover image',
  'fanEvent.noImage': 'No image',
  'fanEvent.influencer': 'Influencer {name}',
  'fanEvent.schedule': '{date} · 1:1 video call {duration}',
  'fanEvent.badge.applied': 'Applied',
  'fanEvent.badge.closed': 'Closed',
  'fanEvent.badge.open': 'Open · until {date}',

  'fanEvent.form.error.title': 'Could not load the application questions',
  'fanEvent.form.error.load': 'Could not load the application questions.',
  'fanEvent.form.reload': 'Reload questions',
  'fanEvent.form.loading': 'Loading application questions',
  'fanEvent.form.loadingText': 'Loading the application questions.',
  'fanEvent.form.required': ' (required)',

  'fanEvent.agree.title': 'Application consent',
  'fanEvent.agree.privacy': 'Consent to collection and use of personal data',
  'fanEvent.agree.recording': 'Consent to video call recording',
  'fanEvent.agree.participation': 'Consent to application rules and participation terms',
  'fanEvent.agree.requiredBadge': 'Required',

  'fanEvent.submit': 'Apply',
  'fanEvent.helper.notOpen': 'Applications are not open.',
  'fanEvent.helper.formLoading': 'Loading the application questions.',
  'fanEvent.helper.formError': 'Check the application questions and try again.',
  'fanEvent.helper.allAgreed': 'All required consents are complete.',
  'fanEvent.helper.needAgree': 'Agree to all {count} required items to apply.',

  'fanEvent.applied.title': 'Your application is in',
  'fanEvent.applied.withResult':
    'Results are announced on {date}. You can track the status in My applications.',
  'fanEvent.applied.withoutResult': 'You can track the status in My applications.',
  'fanEvent.applied.withdrawDeadline': 'Cancellation deadline',
  'fanEvent.applied.myApplications': 'My applications',
  'fanEvent.applied.withdraw': 'Cancel application',

  'fanEvent.failed.title': 'Your application did not go through',
  'fanEvent.failed.retry': 'Apply again',
  'fanEvent.closed.title': 'Applications are closed',
  'fanEvent.closed.description': 'Applications for this fan meeting have ended.',
  'fanEvent.closed.cta': 'Closed',
  'fanEvent.closed.next': 'See other fan meetings',

  'fanEvent.about': 'About this fan meeting',
  'fanEvent.scheduleAria': 'Application schedule',
  'fanEvent.applicationEnd': 'Application deadline',
  'fanEvent.resultAnnounce': 'Result announcement',
  'fanEvent.capacity': '{count} spots',
  'fanEvent.conditions': 'Requirements',
  'fanEvent.condition.identity': 'Account under your own name and completed device check',
  'fanEvent.condition.waitingRoom': 'Enter the waiting room before the fan meeting starts',
  'fanEvent.cautions': 'Please note',
  'fanEvent.caution.recordingKept': 'Recordings are kept for 5 days after the fan meeting',
  'fanEvent.caution.noRecording': 'This fan meeting does not record video calls',
  'fanEvent.caution.moderation': 'Operators may take action if inappropriate behavior occurs',

  'fanEvent.confirm.title': 'Apply to this fan meeting?',
  'fanEvent.confirm.description': 'You can cancel from My page until {date}.',
  'fanEvent.confirm.cancel': 'Cancel',
  'fanEvent.confirm.ok': 'Confirm',

  'fanEvent.submit.needLogin': 'Sign in first to apply.',
  'fanEvent.submit.checkForm': 'Check the application questions and try again.',
  'fanEvent.submit.missingRequired': 'Please answer the required questions: {questions}',
  'fanEvent.submit.needEmailVerify': 'Verify your email to apply.',
  'fanEvent.submit.sessionExpired': 'Your session expired. Please sign in again.',
  'fanEvent.submit.fanOnly': 'Sign in with a fan account to apply.',
  'fanEvent.submit.deviceDuplicate':
    'An application from another account was detected on this device, so we cannot accept this one. If this is your own account, please contact the operations team.',
  'fanEvent.submit.alreadyApplied': 'You have already applied to this event.',
  'fanEvent.submit.tooManyRequests': 'Too many requests. Please try again shortly.',
  'fanEvent.submit.failed': 'Something went wrong while applying. Please try again shortly.',

  'fanEvent.withdraw.needLogin': 'Sign in first to cancel your application.',
  'fanEvent.withdraw.confirm':
    'Cancel your application? You can apply again while applications are open.',
  'fanEvent.withdraw.notAllowed': 'Applications cannot be cancelled right now.',
  'fanEvent.withdraw.failed':
    'Something went wrong while cancelling. Please try again shortly.',
}

/** 언어별 사전이다. ko는 완전하고 en은 부분 번역을 허용한다. */
export const DICTIONARIES: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  ko,
  en,
}

/** 값이 지원 언어인지 좁힌다. 저장값·서버값이 규격 밖이면 기본 언어로 되돌린다. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale)
}
