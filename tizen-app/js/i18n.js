(function () {
  var S = {
    en: {
      home: 'Home', search: 'Search', archive: 'Archive', settings: 'Settings', movies: 'Movies', series: 'Series', anime: 'Anime', account: 'Account',
      mylist: 'My list', watchlist: 'Watchlist', favorite: 'Favorite', favorites: 'Favorites',
      signIn: 'Sign in', scanTitle: 'Scan with your phone', step1: 'Open the camera', step2: 'Scan the code', step3: 'Confirm on 30nama.com',
      orVisit: 'Or visit 30nama.com/auth and enter', waiting: 'Waiting for scan…', expired: 'Code expired',
      guest: 'Continue as guest', refresh: 'New code', loading: 'Loading...', error: 'Something went wrong', retry: 'Retry',
      continueWatching: 'Continue watching', hero_header: 'Featured', new_releases: 'New releases', suggested: 'Suggested',
      top_10: 'Top 10', top10: 'Top 10',
      play: 'Play', resume: 'Resume', details: 'Details', episodes: 'Episodes', season: 'Season', seasons: 'seasons', episode: 'Episode', nowPlaying: 'Now playing', tryAgain: 'Please try again in a moment.', cast: 'Cast', featured: 'Featured',
      movie: 'Movie', persianSub: 'Persian subtitles', minLeft: 'min left', min: 'min', uS: 's', uM: 'm', uH: 'h', free: 'FREE', soon: 'SOON',
      loginRequired: 'Sign in to stream and continue watching', playLogin: 'Sign in to watch', noResults: 'No results', nothingFor: 'Nothing for',
      popularNow: 'Popular now', topResults: 'Top results', searchPh: 'Search movies, series, anime', kbHint: '◀ ▶ ▲ ▼ to type · Right to results',
      space: 'Space', clearK: 'Clear', browse: 'Browse', categories: 'Categories', genres: 'Genres', newest: 'Newest', popular: 'Popular', updated: 'Updated', results: 'results',
      language: 'Language', logout: 'Sign out', login: 'Sign in (QR)', guestAcc: 'Guest', expires: 'Subscription expires', unknown: 'unknown', userType: 'Account type',
      playback: 'Playback', display: 'Display', about: 'About', defSubs: 'Default subtitles', subSize: 'Subtitle size', autoplay: 'Autoplay next episode', reduce: 'Reduce motion',
      takeover: 'Remote button', tkTitle: 'Remote button takeover', tkEnable: 'Take over remote button', tkApps: 'Trigger apps (press the button of…)', tkRunning: 'Service running', tkUnsupported: 'Not available in this install', tkErr: 'Service not reachable', tkChecking: 'Checking service…', tkNoApps: 'No apps seen yet. Press the Samsung TV Plus or Prime Video button once.', tkWhat: 'Make a button on your remote open 30nama. Pick an app you don\'t use: whenever it starts, 30nama opens instead.', tkHow: 'How it works', tkGotIt: 'Got it', tkGood: 'Good to know', tkStep1: 'Turn on "Take over remote button".', tkStep2: 'Under Trigger apps, turn on the app whose remote button you want to use. Not in the list? Press that button once, then come back here.', tkStep3: 'Press that button anywhere on the TV and 30nama opens on top.', tkTip1: 'Pick an app you never use (Samsung TV Plus is a good choice). That app can no longer be opened at all, from the button or from the app list.', tkTip2: 'If an app is listed twice, turn on both: it runs under two IDs.', tkTip3: 'After the TV has been fully powered off, open 30nama once so the button works again.', tkTip4: 'To give the button back to its app, turn "Take over remote button" off.',
      on: 'On', off: 'Off', small: 'Small', medium: 'Medium', large: 'Large', sample: 'This is how subtitles will look.',
      version: 'Version', unofficial: 'Unofficial client for 30nama.com', apiHost: 'API host',
      skipIntro: 'Skip intro', skipRecap: 'Skip recap', nextEpisode: 'Next episode', playNow: 'Play now', credits: 'Credits', audio: 'Audio', subtitles: 'Subtitles', quality: 'Quality', subSync: 'Subtitle sync', subSyncHint: '‹ › shift 0.5s · OK resets', maxQ: 'Max', dlMode: 'Download files (max quality)', dlOff: 'Off', dlMenu: 'In Quality menu', dlAuto: 'Auto (play best)', dlFallback: 'Direct file failed, using stream',
      english: 'English', persian: 'Persian', noStream: 'No stream available', loadMore: 'Load more',
      addedWatch: 'Added to watchlist', removedWatch: 'Removed from watchlist', addedFav: 'Added to favorites', removedFav: 'Removed from favorites', listFailed: 'Could not update your list',
      emptyWatch: 'Your watchlist is empty', emptyFav: 'Your favorites are empty', emptyHint: 'Add titles from their Details page.', listLogin: 'Sign in to see your lists',
      exitTitle: 'Exit 30nama?', exitBody: 'You can come back any time.', exit: 'Exit', cancel: 'Cancel', logoutTitle: 'Sign out?', logoutBody: 'You will need to scan a new code to sign in again.',
      hintPlayer: '▲ Audio & subtitles  ·  OK Play/Pause', hintPlayerEps: '▲ Audio & subtitles  ·  OK Play/Pause  ·  ▼ Episodes',
      welcome: 'Welcome', subFailed: 'Subtitle failed', playErr: 'Playback error',
      trendingWeek: 'Trending this week', newSeries: 'New & returning series', popularMovies: 'Popular movies now', trendingNow: 'Trending',
      crew: 'Crew', reviews: 'Reviews', moreLikeThis: 'More like this', nextEp: 'Next episode', newSeason: 'New season', close: 'Close', tmdb: 'TMDB metadata', tmdbOn: 'Connected', tmdbMock: 'Mock data', tmdbOff: 'Not configured', clearCache: 'Clear metadata cache', cleared: 'Cache cleared', tmdbCredit: 'Movie data from TMDB. Not endorsed or certified by TMDB.',
      status: 'Status', tmdbEnding: 'Connected, key ends in', tmdbBuiltIn: 'Connected, built-in token', tmdbChecking: 'Checking with TMDB…', tmdbBad: 'TMDB rejected this key',
      tmdbNet: 'Can’t reach TMDB right now', tmdbEmpty: 'Type your key first', tmdbKbd: 'Keyboard', tmdbConnect: 'Check and save', tmdbRemove: 'Remove key',
      tmdbRemoveTitle: 'Remove the TMDB key?', tmdbRemoveBody: 'Posters, logos and cast from TMDB will turn off on this TV.', tmdbSaved: 'TMDB connected', tmdbRemoved: 'TMDB key removed',
      tmdbScan: 'Scan to open your TMDB API settings', tmdbChars: 'characters',
      tmdbHelp: 'Enter the 32-character API Key from themoviedb.org/settings/api. The longer Read Access Token works too: use Keyboard, or paste it.',
      Creator: 'Creator', Director: 'Director', Writer: 'Writer', Composer: 'Composer', 'Executive Producer': 'Executive producer', readMore: 'OK to read', scrollHint: '▲ ▼ scroll'
    },
    fa: {
      home: 'خانه', search: 'جستجو', archive: 'آرشیو', settings: 'تنظیمات', movies: 'فیلم', series: 'سریال', anime: 'انیمه', account: 'حساب',
      mylist: 'فهرست من', watchlist: 'لیست تماشا', favorite: 'مورد علاقه', favorites: 'مورد علاقه',
      signIn: 'ورود', scanTitle: 'با گوشی اسکن کنید', step1: 'دوربین را باز کنید', step2: 'کد را اسکن کنید', step3: 'در ۳۰نما تأیید کنید',
      orVisit: 'یا به 30nama.com/auth بروید و وارد کنید', waiting: 'در انتظار اسکن…', expired: 'کد منقضی شد',
      guest: 'ادامه به عنوان مهمان', refresh: 'کد جدید', loading: 'در حال بارگذاری...', error: 'مشکلی پیش آمد', retry: 'تلاش دوباره',
      continueWatching: 'ادامه تماشا', hero_header: 'ویژه', new_releases: 'تازه‌ها', suggested: 'پیشنهادی',
      top_10: '۱۰ برتر', top10: '۱۰ برتر',
      play: 'پخش', resume: 'ادامه', details: 'جزئیات', episodes: 'قسمت‌ها', season: 'فصل', seasons: 'فصل', episode: 'قسمت', nowPlaying: 'در حال پخش', tryAgain: 'لطفاً کمی بعد دوباره تلاش کنید.', cast: 'بازیگران', featured: 'ویژه',
      movie: 'فیلم', persianSub: 'زیرنویس فارسی', minLeft: 'دقیقه مانده', min: 'دقیقه', uS: 'ث', uM: 'د', uH: 'س', free: 'رایگان', soon: 'به‌زودی',
      loginRequired: 'برای پخش و ادامه تماشا وارد شوید', playLogin: 'برای تماشا وارد شوید', noResults: 'نتیجه‌ای نیست', nothingFor: 'چیزی پیدا نشد برای',
      popularNow: 'محبوب این روزها', topResults: 'بهترین نتیجه‌ها', searchPh: 'جستجوی فیلم، سریال، انیمه', kbHint: 'با جهت‌نما تایپ کنید · چپ برای نتایج',
      space: 'فاصله', clearK: 'پاک', browse: 'مرور', categories: 'دسته‌ها', genres: 'ژانرها', newest: 'جدیدترین', popular: 'محبوب', updated: 'به‌روزشده', results: 'نتیجه',
      language: 'زبان', logout: 'خروج از حساب', login: 'ورود (QR)', guestAcc: 'مهمان', expires: 'پایان اشتراک', unknown: 'نامشخص', userType: 'نوع حساب',
      playback: 'پخش', display: 'نمایش', about: 'درباره', defSubs: 'زیرنویس پیش‌فرض', subSize: 'اندازه زیرنویس', autoplay: 'پخش خودکار قسمت بعد', reduce: 'کاهش حرکت',
      takeover: 'دکمه ریموت', tkTitle: 'جایگزینی دکمه ریموت', tkEnable: 'تصاحب دکمه ریموت', tkApps: 'برنامه‌های محرک (دکمهٔ کدام برنامه؟)', tkRunning: 'سرویس در حال اجراست', tkUnsupported: 'در این نصب در دسترس نیست', tkErr: 'سرویس در دسترس نیست', tkChecking: 'در حال بررسی سرویس…', tkNoApps: 'هنوز برنامه‌ای دیده نشده. یک بار دکمهٔ Samsung TV Plus یا Prime Video را بزنید.', tkWhat: 'یکی از دکمه‌های ریموت را برای باز کردن ۳۰نما تنظیم کنید. برنامه‌ای را انتخاب کنید که استفاده نمی‌کنید: هر بار که آن برنامه باز شود، ۳۰نما به جایش باز می‌شود.', tkHow: 'راهنما', tkGotIt: 'متوجه شدم', tkGood: 'نکته‌ها', tkStep1: '«تصاحب دکمه ریموت» را روشن کنید.', tkStep2: 'در بخش برنامه‌های محرک، برنامه‌ای را روشن کنید که می‌خواهید از دکمهٔ ریموتش استفاده کنید. در فهرست نیست؟ یک بار همان دکمه را بزنید و به اینجا برگردید.', tkStep3: 'آن دکمه را در هر جای تلویزیون بزنید تا ۳۰نما روی صفحه باز شود.', tkTip1: 'برنامه‌ای را انتخاب کنید که هرگز استفاده نمی‌کنید؛ مثلاً Samsung TV Plus. آن برنامه دیگر نه با دکمه و نه از فهرست برنامه‌ها باز نمی‌شود.', tkTip2: 'اگر برنامه‌ای دو بار در فهرست آمده، هر دو را روشن کنید: با دو شناسه اجرا می‌شود.', tkTip3: 'پس از خاموش شدن کامل تلویزیون، یک بار ۳۰نما را باز کنید تا دکمه دوباره کار کند.', tkTip4: 'برای برگرداندن دکمه به برنامهٔ خودش، «تصاحب دکمه ریموت» را خاموش کنید.',
      on: 'روشن', off: 'خاموش', small: 'کوچک', medium: 'متوسط', large: 'بزرگ', sample: 'زیرنویس به این شکل نمایش داده می‌شود.',
      version: 'نسخه', unofficial: 'نرم‌افزار غیررسمی ۳۰نما', apiHost: 'سرور API',
      skipIntro: 'رد کردن تیتراژ', skipRecap: 'رد کردن خلاصه', nextEpisode: 'قسمت بعد', playNow: 'پخش اکنون', credits: 'تیتراژ پایانی', audio: 'صدا', subtitles: 'زیرنویس', quality: 'کیفیت', subSync: 'هماهنگی زیرنویس', subSyncHint: '‹ › جابجایی ۰٫۵ ثانیه · OK بازنشانی', maxQ: 'حداکثر', dlMode: 'فایل‌های دانلود (بالاترین کیفیت)', dlOff: 'خاموش', dlMenu: 'در منوی کیفیت', dlAuto: 'خودکار (بهترین)', dlFallback: 'فایل مستقیم پخش نشد، پخش از جریان معمولی',
      english: 'انگلیسی', persian: 'فارسی', noStream: 'پخش در دسترس نیست', loadMore: 'بیشتر',
      addedWatch: 'به لیست تماشا اضافه شد', removedWatch: 'از لیست تماشا حذف شد', addedFav: 'به مورد علاقه‌ها اضافه شد', removedFav: 'از مورد علاقه‌ها حذف شد', listFailed: 'به‌روزرسانی فهرست ممکن نشد',
      emptyWatch: 'لیست تماشای شما خالی است', emptyFav: 'فهرست مورد علاقه‌های شما خالی است', emptyHint: 'از صفحهٔ جزئیات عنوان‌ها را اضافه کنید.', listLogin: 'برای دیدن فهرست‌ها وارد شوید',
      exitTitle: 'خروج از ۳۰نما؟', exitBody: 'هر زمان بخواهید می‌توانید برگردید.', exit: 'خروج', cancel: 'انصراف', logoutTitle: 'خروج از حساب؟', logoutBody: 'برای ورود دوباره باید کد جدیدی اسکن کنید.',
      hintPlayer: '▲ صدا و زیرنویس  ·  OK پخش/توقف', hintPlayerEps: '▲ صدا و زیرنویس  ·  OK پخش/توقف  ·  ▼ قسمت‌ها',
      welcome: 'خوش آمدید', subFailed: 'خطا در زیرنویس', playErr: 'خطای پخش',
      trendingWeek: 'پرطرفدار این هفته', newSeries: 'سریال‌های جدید و ادامه‌دار', popularMovies: 'فیلم‌های محبوب امروز', trendingNow: 'پرطرفدار',
      crew: 'عوامل', reviews: 'نقد و نظر', moreLikeThis: 'مشابه این', nextEp: 'قسمت بعد', newSeason: 'فصل جدید', close: 'بستن', tmdb: 'اطلاعات TMDB', tmdbOn: 'متصل', tmdbMock: 'داده آزمایشی', tmdbOff: 'تنظیم نشده', clearCache: 'پاک کردن حافظه نهان', cleared: 'پاک شد', tmdbCredit: 'اطلاعات فیلم‌ها از TMDB. مورد تأیید TMDB نیست.',
      status: 'وضعیت', tmdbEnding: 'متصل، پایان کلید', tmdbBuiltIn: 'متصل، توکن داخلی', tmdbChecking: 'در حال بررسی با TMDB…', tmdbBad: 'TMDB این کلید را نپذیرفت',
      tmdbNet: 'فعلاً دسترسی به TMDB ممکن نیست', tmdbEmpty: 'اول کلید را وارد کنید', tmdbKbd: 'صفحه‌کلید', tmdbConnect: 'بررسی و ذخیره', tmdbRemove: 'حذف کلید',
      tmdbRemoveTitle: 'کلید TMDB حذف شود؟', tmdbRemoveBody: 'پوستر، لوگو و بازیگران از TMDB روی این تلویزیون خاموش می‌شود.', tmdbSaved: 'TMDB متصل شد', tmdbRemoved: 'کلید TMDB حذف شد',
      tmdbScan: 'برای باز کردن تنظیمات API در TMDB اسکن کنید', tmdbChars: 'نویسه',
      tmdbHelp: 'کلید ۳۲ نویسه‌ای API Key را از themoviedb.org/settings/api وارد کنید. توکن بلندتر Read Access Token هم پذیرفته می‌شود: با صفحه‌کلید یا چسباندن.',
      Creator: 'سازنده', Director: 'کارگردان', Writer: 'نویسنده', Composer: 'آهنگساز', 'Executive Producer': 'تهیه‌کننده اجرایی', readMore: 'OK برای خواندن', scrollHint: '▲ ▼ پیمایش'
    }
  };
  N.lang = N.store.get('lang', 'en');
  N.t = function (k) { var d = S[N.lang] || S.en; return d[k] !== undefined ? d[k] : (S.en[k] !== undefined ? S.en[k] : k); };
  N.setLang = function (l) {
    N.lang = l; N.store.set('lang', l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'fa' ? 'rtl' : 'ltr';
  };
  N.isRtl = function () { return N.lang === 'fa'; };
  document.documentElement.lang = N.lang;
  document.documentElement.dir = N.lang === 'fa' ? 'rtl' : 'ltr';
})();
