/** Study-guide hint database: every parameter, plot and number explained. */

export interface HintContent {
  title: string
  formula?: string
  body: string[]
  list?: string[]
}

const ru: Record<string, HintContent> = {
  // ------------------------------------------------------------ source ---
  vMean: {
    title: 'Скорость пучка ⟨v⟩',
    formula: '⟨v⟩ = √(8kT / πm) ≈ 500…540 м/с при T ≈ 1300 K',
    body: [
      'Атомы серебра вылетают из печи с максвелловским распределением скоростей. Средняя скорость определяется температурой печи T и массой атома m = 1.79·10⁻²⁵ кг.',
      'Скорость задаёт время пролёта магнита τ = L/⟨v⟩ — а значит и отклонение: чем медленнее атом, тем дольше на него действует сила и тем сильнее он отклоняется (z ∝ 1/v²).',
      'Историческая печь Штерна–Герлаха работала при T ≈ 1300 K, что даёт ⟨v⟩ ≈ 540 м/с.',
    ],
  },
  vSigma: {
    title: 'Разброс скоростей σᵥ',
    formula: 'σᵥ = √(kT / m) ≈ 105 м/с при T ≈ 1300 K',
    body: [
      'Ширина максвелловского распределения. Часть атомов летит быстрее, часть медленнее — их отклонения различаются, и пятно на экране размывается.',
      'Это один из трёх источников конечной ширины пятна (вместе с апертурой щели и расходимостью).',
      'Обратите внимание: медленные атомы отклоняются сильнее — «хвост» распределения по z несимметричен в сторону больших |z|.',
    ],
  },
  aperture: {
    title: 'Апертура щели a',
    formula: 'Δz · Δp_z ≥ ħ/2',
    body: [
      'Полуширина щели коллиматора. Ограничивает поперечный размер пучка: пятно на экране не может быть уже, чем начальная ширина пучка.',
      'Компромисс: узкая щель — узкие пятна, но слабый поток; широкая — яркие, но размытые.',
      'Соотношение неопределённостей Гейзенберга здесь практически не играет роли (для атомов Ag с a ~ 0.5 мм Δp_z ~ 10⁻³¹ кг·м/с — на 8 порядков меньше ħ), но концептуально именно щель «готовит» волновой пакет.',
    ],
  },
  divergence: {
    title: 'Расходимость α',
    formula: 'σ(v_z) ≈ α·v',
    body: [
      'Угловой разболн пучка после коллиматора: атомы летят не строго вдоль оси, а в конусе с раствором ~α.',
      'Поперечная скорость σ(v_z) = α·⟨v⟩ за время полёта до экрана даёт дополнительное уширение пятна σ_z = α·⟨v⟩·t.',
      'В реальных установках расходимость определяется геометрией коллиматора (отношением ширины щели к её длине).',
    ],
  },
  screenX: {
    title: 'Положение экрана L',
    formula: 'z = μ_B·G·L_m·(L_m/2 + L_d) / (m·v²)',
    body: [
      'Расстояние от источника до экрана-детектора. Отклонение накапливается в двух зонах: внутри магнита (长度 L_m) и в свободном дрейфе длиной L_d.',
      'Вклад дрейфа линеен по L_d — поэтому в оригинальном эксперименте пластинка-детектор ставилась сразу за магнитом, а считывали изображение под микроскопом.',
      'Формула справедлива для полу-классической модели: z = (μ_B·G/m)·(L_m/v)·(L_m/2v + L_d/v).',
    ],
  },
  particles: {
    title: 'Число частиц N',
    formula: 'σ_p ≈ √(p(1−p)/N)',
    body: [
      'Метод Монте-Карло: каждая частица «разыгрывается» случайно (скорость, фаза спина, исход измерения), а физика — в статистике.',
      'Статистическая ошибка доли ветви падает как 1/√N: при N = 8000 ошибка вероятности ~0.5%, при N = 100 — уже 5%.',
      'Больший N — плавнее гистограмма и точнее проверка cos²(θ/2), но дольше счёт.',
    ],
  },
  // ------------------------------------------------------------- modes ---
  modeClassical: {
    title: 'Классическая модель',
    formula: 'F = ∇(μ·B),  μ — непрерывный вектор',
    body: [
      'Ожидание «старой» (до-1922) физики: магнитный момент атома может быть ориентирован произвольно и непрерывно.',
      'Сила F = ∇(μ·B) отклоняет каждый атом пропорционально проекции его μ на ось магнита. Так как ориентации случайны и равномерны, на экране возникает <b>сплошная полоса</b> — непрерывное распределение отклонений.',
      'Как считается простыми словами: атом — шарик со «стрелкой» μ, которая торчит в случайную сторону и не меняется в полёте. Никакого кубика: каждый атом отклоняется ровно на «свою» величину, а разброс стрелок по всем направлениям и даёт полосу.',
      'Эксперимент Штерна–Герлаха (1922) опроверг это: на экране оказались <b>две чёткие линии</b>. Пространственное квантование подтвердил Пипс–Тейлор (1927) на атомах водорода.',
    ],
  },
  modeSemi: {
    title: 'Полуклассическая модель',
    formula: 'P(↑) = cos²(θ/2),  P(↓) = sin²(θ/2)',
    body: [
      'Спин электрона квантован: проекция на любую ось n(θ) принимает ровно два значения m_s = ±½. Магнитный момент атома Ag (один неспаренный s-электрон): μ = −g_s μ_B S/ħ, |μ| = μ_B.',
      'Сила в магните: F = ±μ_B·(∂B/∂z) — ровно два возможных отклонения, поэтому пучок делится пополам (два пятна).',
      'На входе каждого следующего магнита спин «коллапсирует» на его ось с вероятностями cos²(θ/2) — это правило Борна для проекции спина-½. Так возникает каскадная арифметика ветвей (см. подсказку к таблице ветвей).',
      'Как считается простыми словами: «шарики с кубиком». Атом всегда имеет конкретное положение и скорость, но на входе в магнит бросается «квантовая монетка» (P(↑) = (1 + s·n)/2), спин прилипает к ±n — и дальше обычная классическая траектория с силой ±μ_B·G. Экран — накопление тысяч таких розыгрышей (Монте-Карло).',
      '«Полуклассическая» — потому что траектории считаются классически (нулевая механика), а измерение спина — по квантовым правилам.',
    ],
  },
  modeQuantum: {
    title: 'Квантовая модель (волновой пакет)',
    formula: 'ψ(x,z,t) = Σ_b c_b · N_x(x)·N_z(z − z_b(t)),  |c_b|² = cos²(Δθ/2)…',
    body: [
      'Пучок — это волновой пакет. В магните он не «делится как струя», а расщепляется на <b>суперпозицию</b> двух гауссовых пакетов с весами |c_b|² (правило Борна).',
      'Как считается простыми словами: «размазанная волна, которая делится, а не выбирает». Отдельных атомов нет — весь пучок один пакет ψ. Магнит не бросает монетку: пакет делится на две ветви, и обе живут одновременно (атом «проходит через оба порта»). Блокиратор выжигает целую ветвь, попадания на экран сэмплируются из |ψ|². При большом N гистограмма полуклассики сходится к этому же профилю — вероятность одна, «онтология» разная.',
      'Центры пакетов движутся по классическим траекториям (теорема Эренфеста: d²⟨z⟩/dt² = ⟨F⟩), а огибающие расплываются: σ(t) = σ₀√(1 + (ħt/2mσ₀²)²). Для тяжёлых атомов Ag расплывание ничтожно (~10⁻³ от ширины) — вся ширина пятен определяется апертурой и разбросом скоростей.',
      'Что приближено: это аналитическая суперпозиция, а не численное решение уравнения Паули iħ∂ψ/∂t = [−ħ²∇²/2m − μ·B]ψ. Отличия видны только в деталях дифракции на щели и в структуре фрейн-полей у краёв магнита.',
    ],
  },
  ghost: {
    title: 'Классика-призрак',
    body: [
      'Серые траектории — тот же прогон в классической модели (непрерывный μ). Включите, чтобы напрямую увидеть главное отличие квантовой механики: <b>два пятна вместо сплошной полосы</b>.',
      'Конфигурация магнитов и источник — одинаковые; различаются только правила расчёта отклонения и измерения спина.',
    ],
  },
  // -------------------------------------------------------- apparatus ---
  beam: {
    title: 'Пучок (точка подключения)',
    formula: 'пучок = «источник» | «выход ↑/↓ аппарата №k»',
    body: [
      'После магнита пучок физически распадается на два разлетающихся луча (↑ и ↓). Следующий магнит нельзя поставить «на оба сразу» — он ставится <b>на конкретную ветвь</b> и видит только её атомы.',
      'Это и есть настоящая схема каскадного опыта: SGz → (выбираем ветвь ↑) → SGθ. Аппарат на ветви автоматически «переподготавливает» ансамбль: на его входе все атомы имеют спин ↑ по оси родителя.',
      'Позиция магнита на ветви вычисляется из отклонения родителя (см. подсказку «Позиция X»).',
    ],
  },
  xPos: {
    title: 'Позиция X магнита',
    formula: 'z_ветви(x) = z_выхода + v_z·(x − x_выхода)/v',
    body: [
      'Координата входа магнита вдоль оси пучка. Ограничена: магнит должен стоять после выхода родительского (иначе ветви ещё не разделились).',
      'Поперечное смещение магнита не задаётся вручную — оно вычисляется из импульсного приближения: после родительского магнита ветвь имеет скорость ±aτ вдоль его оси n(θ) и смещение ±aτ²/2, где a = μ_B·G/m, τ = L/v.',
    ],
  },
  angle: {
    title: 'Угол θ магнита',
    formula: 'n(θ) = (0, −sin θ, cos θ) — ось измерения',
    body: [
      'Магнит повёрнут вокруг оси пучка на угол θ: он измеряет проекцию спина на ось n(θ). θ = 0° — «SGz» (расщепление по вертикали), θ = 90° — «SGx».',
      'Изменение базиса измерения — сердце всей арифметики Штерна–Герлаха: если атом пришёл со спином ↑ по оси n(θ₁), то вероятность получить ↑ на оси n(θ₂) равна cos²((θ₁−θ₂)/2).',
      'В 3D-сцене магнит можно вращать гизмо (выделите его кликом) — слайдер и гизмо синхронизированы, шаг привязки 5°.',
    ],
  },
  gradient: {
    title: 'Градиент поля ∂B/∂z',
    formula: 'F_z = ± μ_B · G,  G = ∂B_z/∂z',
    body: [
      'Сила на магнитный момент в неоднородном поле пропорциональна градиенту: F = ∇(μ·B). Именно градиент (а не само поле!) отклоняет атомы.',
      'В оригинальном эксперименте G ~ 10³ Т/м (полюс с острым краем напротив полюса с канавкой). Здесь по умолчанию 1500 Т/м и до 5 кТ/м — завышено ради читаемой картинки: реальное расщепление было ~0.2 мм, его разглядели только под микроскопом.',
      'Геометрия полюсов: острый край (N) даёт большой градиент вблизи кромки; дивергентность поля (∇·B = 0) требует поперечной компоненты B_y = −G·y — она учтена в модели.',
    ],
  },
  length: {
    title: 'Длина магнита L_m',
    formula: 'z_внутри = ½aτ²,  τ = L_m/v',
    body: [
      'Время пролёта поля τ = L_m/⟨v⟩. Отклонение внутри магнита растёт квадратично по τ, а набранная скорость v_z = aτ затем линейно переносится через область дрейфа.',
      'Удлинение магнита эффективнее, чем отодвигание экрана на ту же длину: вклад дрейфа линеен, вклад внутри магнита — квадратичен.',
    ],
  },
  gap: {
    title: 'Зазор между полюсами',
    formula: 'B ≈ μ₀·n·I / g',
    body: [
      'Расстояние между полюсами. Меньше зазор — больше поле и градиент при той же обмотке, но уже область, куда влетает пучок.',
      'В модели зазор задаёт «окно» поля: вне цилиндра радиусом ~g сила экспоненциально гасится (плавное окно), что имитирует спад поля у краёв полюсов.',
    ],
  },
  b0: {
    title: 'Однородное поле B₀',
    formula: 'ω_Лармора = g_s μ_B B₀ / ħ',
    body: [
      'Постоянная составляющая поля между полюсами. Сама по себе <b>не отклоняет</b> атомы (сила определяется градиентом), но заставляет спин прецессировать вокруг B с ларморовой частотой.',
      'В реальном эксперименте B₀ обязателен: он задаёт ось квантования и обеспечивает адиабатическое «следование» спина при входе в область поля (без него проекция не сохранялась бы).',
      'Для серебра ω_Л ≈ 2π·28 ГГц/Тл — прецессия на гигагерцах, в анимации она не показана (спин «прилипает» к измеренной оси).',
    ],
  },
  blocked: {
    title: 'Блокиратор (фильтр спина)',
    body: [
      'Заслонка на одном из выходов магнита. Атомы этой ветви поглощаются — получается «фильтр поляризации», готовящий чистый ансамбль ↑ (или ↓).',
      'Классический опыт с фильтром: SGz с закрытым ↓ + SGx: пучок ↑z делится на SGx строго 50/50 — у спина ↑z нет определённой проекции на x, только вероятности ½.',
      'В статистике поглощённые атомы исключаются из гистограммы (учёт «поглощено» — внизу панели).',
    ],
  },
  // -------------------------------------------------------------- plots ---
  hist: {
    title: 'Гистограмма попаданий N(z)',
    formula: 'ось X: z (мм),  ось Y: N — счёт попаданий',
    body: [
      'Распределение атомов по вертикальной координате z на экране-детекторе — числовой «рентген» осадка серебра.',
      'Два разделённых пика = пространственное квантование (полуклассика/квант). Сплошная полоса = классическое ожидание. Ширина пиков = свёртка апертуры, расходимости и разброса скоростей.',
      'Цвет заливки — ветвь измерения (та же палитра, что у частиц и в таблице ветвей). Гистограмма накапливается по ходу времени — как настоящий осадок.',
    ],
  },
  screenHits: {
    title: 'На экране',
    body: [
      'Число атомов, долетевших до детектора к текущему моменту времени t (при η = 100% все долетевшие детектируются).',
      'Именно из этого счёта строится гистограмма и таблица ветвей.',
    ],
  },
  absorbed: {
    title: 'Поглощено',
    body: [
      'Атомы, снятые блокиратором (фильтром спина). Они не попадают ни на экран, ни в статистику — честный способ «выбросить» ветвь.',
      'Сравните с режимом Белла: там пропуски по η — нежелательная «дыра детекции», а здесь — управляемая подготовка состояния.',
    ],
  },
  branchTable: {
    title: 'Таблица ветвей',
    formula: 'P(↑…↑) = ½·cos²(Δθ₁/2)·cos²(Δθ₂/2)·…',
    body: [
      'Каждая строка — одна «судьба» атома: цепочка исходов ↑/↓ по всем пройденным магнитам (точка = магнит не на пути) с осью последнего измерения.',
      'Теория перемножает вероятности: первый магнит — 50/50 (неполяризованный пучок), каждый следующий — cos²(Δθ/2) от угла с предыдущей осью.',
      'Сравните столбец «Доля» с формулой — это прямая экспериментальная проверка правила Борна на каскадах (пресет «Три по 45°»: ½, ¼, ⅛, ⅛).',
    ],
  },
  // ---------------------------------------------------------- timeline ---
  speed: {
    title: 'Скорость воспроизведения',
    formula: 'весь прогон растянут на ~8 с при 1×',
    body: [
      'Реальный полёт атома длится ~1.3 мс — глазом не увидеть. Плеер показывает прогон в замедлении: при 1× полный цикл занимает ~8 секунд.',
      'Физическое время симуляции отображается в счётчике справа (в мс) — оно и есть «настоящее» время опыта.',
    ],
  },
  loop: {
    title: 'Повтор (цикл)',
    body: [
      'Автоматический перезапуск прогона с обнулением «осадка» на экране и статистики. Выключено — анимация останавливается в конце.',
      'Кнопка ▶ на остановившемся прогоне перематывает в начало и запускает снова.',
    ],
  },
  timeReadout: {
    title: 'Время симуляции t',
    body: [
      'Физическое время от начала эмиссии пучка (в миллисекундах). Полный пролёт установки — около 1.2–1.8 мс в зависимости от геометрии.',
      'Ползунок таймлайна перематывает время: частицы, осадок и статистика честно пересчитываются для выбранного t (детерминированный движок).',
    ],
  },
  // -------------------------------------------------------------- bell ---
  bellSource: {
    title: 'Источник запутанных пар |ψ⁻⟩ (event-ready)',
    formula: '|ψ⁻⟩ = (|↑↓⟩ − |↓↑⟩)/√2',
    body: [
      'В центре стоит источник, рождающий пары атомов в синглетном состоянии: спины всегда <b>противоположны</b>, но по отдельности полностью неопределённы (_each ±1 с вероятностью ½).',
      'У Хансена (2015) спины NV-центров запутывались «обменом запутанностью»: каждый спин запутывался с фотоном, фотоны летели в середину (станция C), и совпадение детекций на светоделителе «герольдило» готовность пары (схема Барретта–Кока). Здесь пара рождается готовой — идеализация.',
      'Синглет — единственное состояние с полностью изотропными корреляциями: E(a,b) = −cos(θa−θb) в любом базисе.',
    ],
  },
  bellModelQuantum: {
    title: 'Квантовая модель (синглет)',
    formula: 'E(a,b) = ⟨x·y⟩ = −cos(θa − θb)',
    body: [
      'Выборки Монте-Карло: исход у Алисы x = ±1 равновероятен; исход у Боба коррелирован по правилу Борна: P(y = −x) = (1+cos Δ)/2.',
      'На углах Хансена это даёт S = 2√2 — максимальное нарушение CHSH (граница Цирельсона).',
      'Ключевое: корреляции «сильнее любых локальных», хотя никакой сигнал между станциями не передаётся — пояснения в подсказке к S.',
    ],
  },
  bellModelLocal: {
    title: 'Локальный реализм (скрытые параметры)',
    formula: 'x = sign cos(θa−φ),  y = −sign cos(θb−φ)',
    body: [
      'Гипотеза Эйнштейна–Подольского–Розена: пара рождается с <b>заранее определёнными</b> значениями (скрытый параметр φ — направление «истинного» спина). Каждая станция честно измеряет свою частицу, ничего не зная о другой.',
      'Эта конкретная модель даёт линейную корреляцию E(Δ) = −1 + 2Δ/π и выходит ровно на границу S = 2.',
      'Теорема Белла (1964): <b>любая</b> теория такого класса (локальная + реализм) даёт S ≤ 2 — какие бы φ и функции вы ни придумали. Квантовая механика предсказывает до 2√2. Эксперимент решает спор.',
    ],
  },
  bellStation: {
    title: 'Базисы станции (θ₀, θ₁)',
    formula: 'a₀=0°, a₁=90°, b₀=−135°−ε, b₁=+135°+ε (ε≈4.7°)',
    body: [
      'У каждой станции два предустановленных базиса; перед каждым прилётом пары «QRNG» случайно выбирает один (лампа мигает). Случайность и независимость выбора — условие локальности теста.',
      'Углы не произвольны: численная оптимизация в статье Хансена подобрала их под неидеальность установки (асимметрия Z/X корреляций → маленькая поправка ε).',
      'Магнит в 3D «щёлкает» к выбранному базису при подлёте пары — как переключатель СВЧ-импульсов в реальном эксперименте (160 нс на выбор).',
    ],
  },
  bellEff: {
    title: 'Эффективность детекции η',
    formula: 'нарушение CHSH требует η > 2/3 (идеальный случай)',
    body: [
      'Вероятность, что сторона зарегистрирует прилетающий атом. Пропуски — «дыра детекции»: если детекторы плохие, можно отвергать неудобные события (предположение «честной выборки») и поддельно нарушить неравенство.',
      'Тrial засчитывается только при совпадении — обе стороны детектировали. При η = 0.7 остаётся ~49% пар, при 0.5 — 25%.',
      'У Хансена одношотовое считывание спина NV (~97%) закрыло эту дыру; порог нарушения для максимально запутанных состояний — η > 2/3.',
    ],
  },
  bellVis: {
    title: 'Видность V (шум запутанности)',
    formula: 'ρ = V·|ψ⁻⟩⟨ψ⁻| + (1−V)·I/4,  нарушение ⟺ V > 1/√2',
    body: [
      'Доля «хороших» пар: с вероятностью V пара — идеальный синглет, с вероятностью 1−V — белая смесь (случайные исходы). Корреляции масштабируются: E = −V·cos Δ.',
      'Состояние такого вида называется состоянием Вернера. Нарушение CHSH выживает, пока V > 1/√2 ≈ 0.707 — задайте 0.7 и убедитесь.',
      'В реальном эксперименте V отражает фиделити запутанности (у Хансена F = 0.92 → ожидаемое S = 2.30).',
    ],
  },
  bellPairs: {
    title: 'Пар за прогон N',
    formula: 'δS ≈ √(8/N_trials)',
    body: [
      'Сколько пар эмитирует источник за прогон. Статистическая ошибка S падает как 1/√N: при 500 валидных триалах δS ≈ 0.13, при 50000 — 0.013.',
      'Сравните масштаб с реальным тестом: у Хансена было всего 245 триалов за 220 часов (S = 2.42 ± 0.20) — каждый триал дорог, отсюда важность каждого процента η.',
    ],
  },
  chshS: {
    title: 'Параметр CHSH: S',
    formula: 'S = E₀₀ + E₀₁ + E₁₀ − E₁₁   (≤ 2 локально, ≤ 2√2 квантово)',
    body: [
      'Неравенство Клаузера–Хорна–Шимони–Хольта: в любой <b>локальной реалистической</b> теории (исходы определены заранее, влияния не быстрее света, базисы выбраны свободно и независимо) комбинация четырёх корреляций не превышает 2.',
      'Квантовая механика для синглета даёт до 2√2 ≈ 2.828 (граница Цирельсона). S > 2 — доказательство, что мир не локально-реалистичен.',
      'Hensen et al. (Nature 526, 682, 2015): S = 2.42 ± 0.20 при 245 триалах, p = 0.039 — первое «бездырочное» нарушение (закрыты дыры детекции и локальности одновременно).',
      'Заметьте: при конечной статистике оценка S может слегка превысить 2 и в локальной модели (флуктуация ±δS) — смотрите на устойчивость превышения, а не на одиночное значение.',
    ],
  },
  chshE: {
    title: 'Корреляция ⟨x·y⟩(a,b)',
    formula: 'E = (N_совп − N_разн)/(N_совп + N_разн)',
    body: [
      'Для каждой пары базисов (a,b) считается корреляция исходов: +1 для совпадений, −1 для противоположных. E ∈ [−1, 1].',
      'Для синглета E(a,b) = −cos(θa−θb): равные углы → идеальная антикорреляция (−1), перпендикулярные → ноль. Именно эту зависимость «ломают» локальные модели (у них E = −1+2Δ/π — линейная).',
      'Таблица воспроизводит Fig. 4a статьи Хансена: четыре комбинации базисов с числами событий.',
    ],
  },
  chshTable: {
    title: 'Матрица корреляций',
    body: [
      'Четыре строки — комбинации настроек (a,b) ∈ {0,1}×{0,1}; для каждой: реализованные углы, знак в формуле S и набранная корреляция с числом событий.',
      'Знаки: три комбинации входят в S со «+», (1,1) — со «−». Именно этот минус делает неравенство «неугадываемым» для локальных моделей.',
    ],
  },
  chshTheory: {
    title: 'Теоретическое S (квант)',
    formula: 'S_теор = |−cos Δ₀₀ − cos Δ₀₁ − cos Δ₁₀ + cos Δ₁₁|·V',
    body: [
      'Что предсказывает квантовая механика для текущих углов станций и видности V. Сравнение с измеренным S — мгновенная проверка соответствия.',
      'Отклонение больше, чем δS ≈ √(8/N) — сигнал, что модель или настройки «не квантовые» (попробуйте локальный реализм: там S застрянет у 2).',
    ],
  },
  sCurve: {
    title: 'График S(N): сходимость',
    formula: 'δS ∝ 1/√N',
    body: [
      'Бегущее значение S по мере накопления триалов. Синяя линия — локальный предел 2, зелёная — Цирельсон 2√2.',
      'В квантовой модели кривая сходится к ~2.8 (сверху или снизу — случайно), в локальной — жмётся к 2 снизу/сверху, но устойчиво не превышает.',
      'Наглядное пособие о том, почему Белл-тесту нужны тысячи триалов: на малых N кривая гуляет и может «нарушить» неравенство чисто статистически.',
    ],
  },
  histQuantum: {
    title: 'Профиль |ψ|² на экране',
    formula: 'ρ(z, t) = |ψ(screenX, z, t)|²',
    body: [
      'В квантовом режиме гистограмма показывает плотность вероятности волнового пакета в колонке экрана в момент t (синяя кривая), а «осадок» точек — Монте-Карло сэмплирование из этой же плотности.',
      'Расщепление пакета на два горба = суперпозиция ветвей; их высоты — |c_↑|² и |c_↓|².',
    ],
  },
}

const en: Record<string, HintContent> = {
  vMean: {
    title: 'Beam velocity ⟨v⟩',
    formula: '⟨v⟩ = √(8kT / πm) ≈ 500…540 m/s at T ≈ 1300 K',
    body: [
      'Silver atoms leave the oven with a Maxwell–Boltzmann velocity distribution set by the oven temperature T and the atomic mass m = 1.79·10⁻²⁵ kg.',
      'Velocity fixes the time spent in the magnet τ = L/⟨v⟩ and hence the deflection: slower atoms are deflected more (z ∝ 1/v²).',
      'The historical Stern–Gerlach oven ran at T ≈ 1300 K, giving ⟨v⟩ ≈ 540 m/s.',
    ],
  },
  vSigma: {
    title: 'Velocity spread σᵥ',
    formula: 'σᵥ = √(kT / m) ≈ 105 m/s at T ≈ 1300 K',
    body: [
      'Width of the Maxwell distribution: some atoms fly faster, some slower, spreading the screen spots.',
      'One of the three finite-width sources (with slit aperture and divergence). Slow atoms deflect more, so the z-distribution gets a tail at large |z|.',
    ],
  },
  aperture: {
    title: 'Slit aperture a',
    formula: 'Δz · Δp_z ≥ ħ/2',
    body: [
      'Half-width of the collimator slit; the beam cannot be narrower on the screen than at the slit.',
      'Trade-off: narrow slit → sharp spots but weak flux; wide → bright but blurry.',
      'Heisenberg uncertainty is negligible here (Δp_z ~ 10⁻³¹ kg·m/s, eight orders below ħ) — but conceptually the slit prepares the wavepacket.',
    ],
  },
  divergence: {
    title: 'Divergence α',
    formula: 'σ(v_z) ≈ α·v',
    body: [
      'Angular spread after the collimator: atoms fly in a cone of opening ~α instead of exactly along the axis.',
      'Transverse velocity σ(v_z) = α·⟨v⟩ broadens the spots by σ_z = α·⟨v⟩·t over the flight time.',
    ],
  },
  screenX: {
    title: 'Screen position L',
    formula: 'z = μ_B·G·L_m·(L_m/2 + L_d) / (m·v²)',
    body: [
      'Source-to-detector distance. Deflection accumulates inside the magnet (length L_m) and in the free drift L_d.',
      'The drift contribution is linear in L_d — that is why the original experiment used a plate right behind the magnet, read out under a microscope.',
    ],
  },
  particles: {
    title: 'Particle count N',
    formula: 'σ_p ≈ √(p(1−p)/N)',
    body: [
      'Monte-Carlo: each atom is randomly sampled (velocity, spin phase, measurement outcome); the physics lives in the statistics.',
      'Statistical error of a branch fraction falls as 1/√N: N = 8000 gives ~0.5% accuracy, N = 100 already 5%.',
    ],
  },
  modeClassical: {
    title: 'Classical model',
    formula: 'F = ∇(μ·B),  μ — continuous vector',
    body: [
      'Pre-1922 expectation: the atomic magnetic moment can point anywhere continuously.',
      'F = ∇(μ·B) deflects each atom proportionally to the projection of μ onto the magnet axis; random orientations smear into a <b>continuous band</b>.',
      'In plain words: the atom is a ball with a μ arrow pointing in a random direction, fixed for the whole flight. No dice — each atom deflects by exactly “its own” amount, and the uniform spread of arrow orientations produces the band.',
      'Stern and Gerlach (1922) saw <b>two distinct lines</b> instead; Phipps and Taylor (1927) confirmed spatial quantization with hydrogen.',
    ],
  },
  modeSemi: {
    title: 'Semiclassical model',
    formula: 'P(↑) = cos²(θ/2),  P(↓) = sin²(θ/2)',
    body: [
      'Spin is quantized: projection on any axis n(θ) takes exactly two values m_s = ±½; for Ag (one unpaired s-electron) |μ| = μ_B.',
      'Force in the magnet: F = ±μ_B·(∂B/∂z) — exactly two deflections, hence two spots.',
      'At each next magnet the spin projects onto its axis with Born probabilities cos²(θ/2) — this generates the whole cascade arithmetic.',
      'In plain words: “balls with a die”. The atom always has a definite position and velocity, but at the magnet entrance a quantum coin is tossed (P(↑) = (1 + s·n)/2), the spin snaps to ±n — and from there it is an ordinary classical trajectory under ±μ_B·G. The screen picture accumulates thousands of such Monte-Carlo runs.',
      '“Semiclassical” because trajectories are classical mechanics while spin measurement follows quantum rules.',
    ],
  },
  modeQuantum: {
    title: 'Quantum model (wavepacket)',
    formula: 'ψ(x,z,t) = Σ_b c_b · N_x(x)·N_z(z − z_b(t)),  |c_b|² = cos²(Δθ/2)…',
    body: [
      'The beam is a wavepacket. In the magnet it does not “split like a jet” — it becomes a <b>superposition</b> of two gaussian branches with weights |c_b|².',
      'In plain words: “a smeared wave that splits rather than chooses”. There are no individual atoms — the whole beam is one packet ψ. The magnet tosses no coin: the packet splits into two branches and both live at once (the atom “goes through both ports”). A blocker burns away a whole branch; screen hits are sampled from |ψ|². At large N the semiclassical histogram converges to this same profile — same probabilities, different ontology.',
      'Branch centers follow classical trajectories (Ehrenfest theorem); envelopes spread as σ(t) = σ₀√(1+(ħt/2mσ₀²)²) — negligible for heavy Ag atoms.',
      'Honest approximation: this is an analytic superposition, not a numerical solution of the Pauli equation iħ∂ψ/∂t = [−ħ²∇²/2m − μ·B]ψ; the differences appear only in slit diffraction detail and fringe-field structure.',
    ],
  },
  ghost: {
    title: 'Classical ghost',
    body: [
      'Gray trajectories are the same run in the classical model. Enable it to see the key difference directly: <b>two spots instead of a continuous band</b>.',
    ],
  },
  beam: {
    title: 'Beam (attach point)',
    formula: 'beam = “source” | “output ↑/↓ of apparatus #k”',
    body: [
      'After a magnet the beam physically splits into two diverging rays (↑ and ↓). A downstream magnet cannot sit “on both” — it is placed <b>on a specific branch</b> and sees only its atoms.',
      'This is the real cascade geometry: SGz → (select ↑) → SGθ. The apparatus on a branch re-prepares the ensemble: all its incoming atoms are ↑ along the parent axis.',
    ],
  },
  xPos: {
    title: 'Magnet X position',
    formula: 'z_branch(x) = z_exit + v_z·(x − x_exit)/v',
    body: [
      'Entrance coordinate along the beam. Constrained to sit after the parent’s exit (branches must have separated).',
      'The transverse offset is computed automatically from the impulse approximation: after the parent, a branch moves at ±aτ along its axis n(θ) with offset ±aτ²/2, where a = μ_B·G/m, τ = L/v.',
    ],
  },
  angle: {
    title: 'Magnet angle θ',
    formula: 'n(θ) = (0, −sin θ, cos θ) — measurement axis',
    body: [
      'Rotation about the beam axis: the magnet measures spin projection onto n(θ). θ = 0° is “SGz”, θ = 90° is “SGx”.',
      'Basis change is the heart of Stern–Gerlach arithmetic: an atom ↑ along n(θ₁) passes ↑ on n(θ₂) with probability cos²((θ₁−θ₂)/2).',
      'In the 3D scene you can rotate the selected magnet with the gizmo (5° snapping); slider and gizmo stay in sync.',
    ],
  },
  gradient: {
    title: 'Field gradient ∂B/∂z',
    formula: 'F_z = ± μ_B · G,  G = ∂B_z/∂z',
    body: [
      'Force on a moment in a nonuniform field: F = ∇(μ·B). The gradient — not the field itself — deflects atoms.',
      'The original experiment used G ~ 10³ T/m (sharp-edged pole vs grooved pole). Defaults here (1500 T/m, up to 5 kT/m) are exaggerated for readability: the real split was ~0.2 mm, visible only under a microscope.',
      'Field geometry: ∇·B = 0 forces a transverse component B_y = −G·y, included in the model.',
    ],
  },
  length: {
    title: 'Magnet length L_m',
    formula: 'z_inside = ½aτ²,  τ = L_m/v',
    body: [
      'Time in the field τ = L_m/⟨v⟩. In-magnet deflection grows quadratically in τ; the gained velocity v_z = aτ then translates linearly through the drift.',
      'Lengthening the magnet beats pushing the screen by the same distance: quadratic vs linear contribution.',
    ],
  },
  gap: {
    title: 'Pole gap',
    formula: 'B ≈ μ₀·n·I / g',
    body: [
      'Distance between poles: smaller gap → stronger field and gradient for the same coil, but a narrower usable region.',
      'In the model the gap sets the field “window”: outside a cylinder of radius ~g the force is smoothly suppressed.',
    ],
  },
  b0: {
    title: 'Uniform field B₀',
    formula: 'ω_Larmor = g_s μ_B B₀ / ħ',
    body: [
      'Constant field component. By itself it <b>does not deflect</b> (force needs a gradient) but spins precess about B at the Larmor frequency.',
      'In real experiments B₀ defines the quantization axis and guarantees adiabatic following at the magnet entrance.',
      'For silver ω_L ≈ 2π·28 GHz/T — precession is not animated (spin locks to the measured axis).',
    ],
  },
  blocked: {
    title: 'Blocker (spin filter)',
    body: [
      'A shutter on one magnet output: that branch is absorbed — a polarization filter preparing a pure ↑ (or ↓) ensemble.',
      'Classic filtered experiment: SGz with ↓ blocked + SGx splits the ↑z beam exactly 50/50 — ↑z has no definite x-projection, only probabilities.',
    ],
  },
  hist: {
    title: 'Hit histogram N(z)',
    formula: 'X: z (mm),  Y: N — hit count',
    body: [
      'Distribution of atoms over the vertical coordinate z on the detector — a numerical “X-ray” of the silver deposition.',
      'Two separated peaks = spatial quantization (semiclassical/quantum); a continuous band = the classical expectation. Peak width folds in aperture, divergence and velocity spread.',
      'Fill color = measurement branch (same palette as particles and the branch table). The histogram accumulates in time — like real deposition.',
    ],
  },
  screenHits: {
    title: 'On screen',
    body: ['Atoms that reached the detector by the current time t (with η = 100% every arrival is counted).'],
  },
  absorbed: {
    title: 'Absorbed',
    body: [
      'Atoms removed by a blocker (spin filter): excluded from screen and statistics — an honest way to discard a branch.',
      'Contrast with the Bell mode: there η-misses are an unwanted “detection loophole”, here they are controlled state preparation.',
    ],
  },
  branchTable: {
    title: 'Branch table',
    formula: 'P(↑…↑) = ½·cos²(Δθ₁/2)·cos²(Δθ₂/2)·…',
    body: [
      'Each row is one atomic “fate”: the chain of ↑/↓ outcomes over the magnets it actually passed (dot = not on its path) with the last measurement axis.',
      'Theory multiplies probabilities: first magnet 50/50 (unpolarized beam), each next cos²(Δθ/2) against the previous axis.',
      'Compare the “Fraction” column with the formula — a direct Born-rule test on cascades (preset “Three at 45°”: ½, ¼, ⅛, ⅛).',
    ],
  },
  speed: {
    title: 'Playback speed',
    formula: 'full run stretched to ~8 s at 1×',
    body: [
      'The real flight lasts ~1.3 ms — invisible to the eye. At 1× the player stretches the whole run to about 8 seconds.',
      'The physical simulation time is shown in the counter (ms) — that is the experiment’s “true” time.',
    ],
  },
  loop: {
    title: 'Loop',
    body: [
      'Auto-restart with cleared screen deposition and statistics. Off — the animation stops at the end.',
      'Pressing ▶ on a finished run rewinds to the start and plays again.',
    ],
  },
  timeReadout: {
    title: 'Simulation time t',
    body: [
      'Physical time since beam emission started (milliseconds); a full flight is ~1.2–1.8 ms depending on geometry.',
      'The timeline scrubber rewinds time — particles, deposition and statistics are recomputed deterministically for the chosen t.',
    ],
  },
  bellSource: {
    title: 'Entangled pair source |ψ⁻⟩ (event-ready)',
    formula: '|ψ⁻⟩ = (|↑↓⟩ − |↓↑⟩)/√2',
    body: [
      'The central source emits atom pairs in the singlet state: spins always <b>opposite</b>, individually fully undetermined (each ±1 with probability ½).',
      'In Hanson 2015 the NV-center spins were entangled by entanglement swapping: each spin was entangled with a photon, the photons met at station C, and a beam-splitter coincidence heralded the pair (Barrett–Kok scheme). Here the pair is born ready — an idealization.',
      'The singlet is the unique state with isotropic correlations: E(a,b) = −cos(θa−θb) in any basis.',
    ],
  },
  bellModelQuantum: {
    title: 'Quantum model (singlet)',
    formula: 'E(a,b) = ⟨x·y⟩ = −cos(θa − θb)',
    body: [
      'Monte-Carlo sampling: Alice’s outcome x = ±1 is equiprobable; Bob’s is correlated by the Born rule: P(y = −x) = (1+cos Δ)/2.',
      'At the Hensen angles this yields S = 2√2 — the maximal CHSH violation (Tsirelson bound).',
      'Key point: correlations exceed any local bound although no signal travels between stations — see the S hint.',
    ],
  },
  bellModelLocal: {
    title: 'Local realism (hidden variables)',
    formula: 'x = sign cos(θa−φ),  y = −sign cos(θb−φ)',
    body: [
      'The EPR hypothesis: the pair is born with <b>predefined</b> values (hidden parameter φ — the “true” spin direction). Each station honestly measures its own atom, knowing nothing about the other.',
      'This particular model gives the linear correlation E(Δ) = −1 + 2Δ/π and saturates S = 2 exactly.',
      'Bell’s theorem (1964): <b>any</b> theory of this class obeys S ≤ 2 — whatever φ and functions you invent. Quantum mechanics predicts up to 2√2. Experiment arbitrates.',
    ],
  },
  bellStation: {
    title: 'Station bases (θ₀, θ₁)',
    formula: 'a₀=0°, a₁=90°, b₀=−135°−ε, b₁=+135°+ε (ε≈4.7°)',
    body: [
      'Each station has two preset bases; before each pair arrives the “QRNG” picks one at random (the lamp flashes). Random, independent choices are the locality condition of the test.',
      'The angles are not arbitrary: numerical optimization in the Hanson paper tuned them to setup imperfections (Z/X correlation asymmetry → small ε).',
      'The 3D magnet snaps to the chosen basis as the pair approaches — like the microwave-switch in the real experiment (160 ns per choice).',
    ],
  },
  bellEff: {
    title: 'Detection efficiency η',
    formula: 'CHSH violation needs η > 2/3 (ideal case)',
    body: [
      'Probability that a side registers an incoming atom. Misses open the “detection loophole”: with bad detectors one could discard inconvenient events (fair-sampling assumption) and fake a violation.',
      'A trial counts only on coincidences — both sides detected. At η = 0.7 about 49% of pairs survive, at 0.5 — 25%.',
      'Hanson’s single-shot NV readout (~97%) closed this loophole; the violation threshold for maximally entangled states is η > 2/3.',
    ],
  },
  bellVis: {
    title: 'Visibility V (entanglement noise)',
    formula: 'ρ = V·|ψ⁻⟩⟨ψ⁻| + (1−V)·I/4,  violation ⟺ V > 1/√2',
    body: [
      'Fraction of “good” pairs: with probability V the pair is a perfect singlet, otherwise white noise. Correlations scale: E = −V·cos Δ.',
      'Such states are called Werner states. CHSH violation survives while V > 1/√2 ≈ 0.707 — set 0.7 and watch it die.',
      'In the real experiment V reflects the entanglement fidelity (Hanson: F = 0.92 → expected S = 2.30).',
    ],
  },
  bellPairs: {
    title: 'Pairs per run N',
    formula: 'δS ≈ √(8/N_trials)',
    body: [
      'How many pairs the source emits per run. The statistical error of S falls as 1/√N: 500 valid trials give δS ≈ 0.13, 50000 give 0.013.',
      'Compare with reality: Hanson had just 245 trials in 220 hours (S = 2.42 ± 0.20) — every percent of η matters.',
    ],
  },
  chshS: {
    title: 'CHSH value: S',
    formula: 'S = E₀₀ + E₀₁ + E₁₀ − E₁₁   (≤ 2 local, ≤ 2√2 quantum)',
    body: [
      'The Clauser–Horne–Shimony–Holt inequality: in any <b>local realist</b> theory (outcomes predefined, no faster-than-light influences, free independent basis choices) this combination of four correlations cannot exceed 2.',
      'Quantum mechanics reaches 2√2 ≈ 2.828 for the singlet (Tsirelson bound). S > 2 proves the world is not local-realist.',
      'Hensen et al. (Nature 526, 682, 2015): S = 2.42 ± 0.20 over 245 trials, p = 0.039 — the first “loophole-free” violation (detection and locality closed simultaneously).',
      'Note: with finite statistics a local model can also wander slightly above 2 (±δS) — look for a persistent excess, not a single reading.',
    ],
  },
  chshE: {
    title: 'Correlation ⟨x·y⟩(a,b)',
    formula: 'E = (N_same − N_diff)/(N_same + N_diff)',
    body: [
      'For each basis pair (a,b): +1 for equal outcomes, −1 for opposite; E ∈ [−1, 1].',
      'For the singlet E(a,b) = −cos(θa−θb): equal angles → perfect anticorrelation (−1), perpendicular → zero. Local models “break” this cosine (theirs is linear: E = −1+2Δ/π).',
      'The table reproduces Fig. 4a of the Hanson paper: four basis combinations with event counts.',
    ],
  },
  chshTable: {
    title: 'Correlation matrix',
    body: [
      'Four rows — setting combinations (a,b) ∈ {0,1}×{0,1}: realized angles, sign in S, and the accumulated correlation with event count.',
      'Signs: three combinations enter S with “+”, (1,1) with “−”. That minus is what makes the inequality impossible to game locally.',
    ],
  },
  chshTheory: {
    title: 'Theoretical S (quantum)',
    formula: 'S_theory = |−cos Δ₀₀ − cos Δ₀₁ − cos Δ₁₀ + cos Δ₁₁|·V',
    body: [
      'What quantum mechanics predicts for the current station angles and visibility V — compare with the measured S for an instant consistency check.',
      'A deviation beyond δS ≈ √(8/N) signals a “non-quantum” setup (try local realism: S sticks to 2).',
    ],
  },
  sCurve: {
    title: 'S(N) convergence',
    formula: 'δS ∝ 1/√N',
    body: [
      'Running S as trials accumulate. Blue line — local bound 2, green — Tsirelson 2√2.',
      'The quantum curve converges to ~2.8; the local one hugs 2 without persistently exceeding it.',
      'A visual lesson in why Bell tests need many trials: at small N the curve wanders and can “violate” by pure chance.',
    ],
  },
  histQuantum: {
    title: '|ψ|² profile on the screen',
    formula: 'ρ(z, t) = |ψ(screenX, z, t)|²',
    body: [
      'In quantum mode the panel shows the wavepacket probability density in the screen column at time t (blue curve); the deposited dots are Monte-Carlo samples of the same density.',
      'Two humps = superposition of branches with heights |c_↑|² and |c_↓|².',
    ],
  },
}

export const hintsContent: Record<'ru' | 'en', Record<string, HintContent>> = { ru, en }
