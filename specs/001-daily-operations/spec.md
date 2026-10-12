# Feature Specification: الشغل اليومي لمخزن الشرائح والمسامير (المرحلة 1)

**Feature Branch**: `claude/warehouse-management-app-e964ec`

**Created**: 2026-10-12

**Status**: Draft

**Input**: User description: "برنامج يغنيني عن الإكسيل والورق في إدارة مخزن الشرائح والمسامير الحكومي: استلام الطلبيات بالباركود، والصرف للمندوب بالبدائل، والأرصدة، وكارت الصنف، والمطبوعات، على الموبايل واللاب، ويشتغل من غير نت." Phase 1 of 3 (daily operations). Official prints (monthly report, ID cards) are phase 2; stock count is phase 3.

**Source material**: `E:\شرائح ومسامير\شرائح و مسامير.xlsx` (the workbook), `PRODUCT.md`, `.specify/memory/constitution.md`.

## User Scenarios & Testing *(mandatory)*

المستخدم الوحيد: أمين المخزن. بيستخدم البرنامج على موبايل أندرويد جوه المخزن، وعلى اللاب للمراجعة والتصدير.

### User Story 1 - نقل المخزن من الإكسيل والتأكد إن الأرقام مطابقة (Priority: P1)

أمين المخزن بيدّي البرنامج ملف الإكسيل الحالي. البرنامج بيقرا منه الـ 97 صنف وكل الحركات المسجلة، وبعدها يعرض شاشة مقارنة: رصيد كل صنف في البرنامج قصاد رصيده في شيت "الأرصدة اللحظية".

**Why this priority**: من غير الخطوة دي مفيش داتا يشتغل عليها، ومفيش ثقة. لو الأرصدة مطابقتش الإكسيل، أمين المخزن مش هيعتمد على البرنامج.

**Independent Test**: نستورد الملف الحقيقي ونتأكد إن رصيد الـ 97 صنف كلهم مطابق لقيمة عمود "الرصيد الحالي" في الإكسيل.

**Acceptance Scenarios**:

1. **Given** ملف الإكسيل الحالي (97 صنف و237 حركة)، **When** أمين المخزن يستورده، **Then** يظهر 97 صنف ببياناتهم (الكود، ورقم الصفحة، والفئة، والاسم العربي والإنجليزي، والخامة، والمقاس، والوحدة، والشركة، والـ GTIN لو موجود، والسعر)، و237 حركة بتواريخها وأنواعها وكمياتها وملاحظاتها.
2. **Given** الاستيراد خلص، **When** يفتح شاشة المطابقة، **Then** يشوف لكل صنف رصيد البرنامج ورصيد الإكسيل وعلامة "مطابق"، والعدّاد بيقول 97 من 97 مطابق.
3. **Given** إن أرصدة البداية متسجلة في السجل كحركات "إضافة" (رصيد افتتاحي)، **When** يتم الاستيراد، **Then** الرصيد الافتتاحي ميتحسبش مرتين.
4. **Given** صنف ليه حالة في الإكسيل (متاح، يحتاج طلب، نافد)، **When** يتم الاستيراد، **Then** البرنامج يطلّع نفس الحالة.
5. **Given** إن الملف اتستورد قبل كده، **When** يحاول يستورده تاني، **Then** البرنامج يرفض الاستيراد ويقوله إمتى اتعمل قبل كده، ومفيش حركة تتكرر.

---

### User Story 2 - استلام طلبية من الشركة (Priority: P1)

المندوب جاب طلبية بإذن تسليم وفاتورة. أمين المخزن بيفتح "استلام"، ويكتب الشركة ورقم الإذن ورقم الفاتورة مرة واحدة. لكل صنف بيصوّر الباركود أو بيكتب رقم الصفحة، ويكتب التشغيلة والصلاحية والكمية اللي في الفاتورة والكمية اللي اتعدّت فعلاً. لو فيه فرق بيكتب سببه. وفي الآخر بيعتمد الإذن.

**Why this priority**: ده أكتر شغل يومي بيتعمل، ومن هنا البرنامج بيبدأ يغني عن الورق.

**Independent Test**: نعمل إذن استلام فيه 4 أصناف (واحد بفرق في العدد، وواحد بباركود مش معروف، وواحد بسعر جديد)، ونعتمده، ونتأكد إن الأرصدة زادت باللي اتعدّ، والسعر اتحدّث، والـ GTIN اتربط.

**Acceptance Scenarios**:

1. **Given** إذن استلام مفتوح، **When** يصوّر باركود معروف، **Then** الصنف يظهر باسمه ورقم صفحته وكوده، والسعر متملي بآخر سعر شراء.
2. **Given** الكاميرا مش شغالة أو الباركود مش مقروء، **When** يكتب رقم الصفحة (مثلاً `10`) أو الـ GTIN بإيده (8 أو 13 رقم) أو الكود (`SCR-01`) أو جزء من الاسم، **Then** نفس الصنف يظهر. لو الكلمة فيها أكتر من صنف، تظهر قايمة يختار منها.
3. **Given** باركود مش متسجل على أي صنف، **When** يصوّره، **Then** البرنامج يطلب منه يختار الصنف مرة واحدة، والـ GTIN يتربط بالصنف ده بعد الاعتماد، والمرة الجاية يتعرف لوحده. (حوالي نص الأصناف لسه من غير GTIN، فده هيحصل كتير في الأسابيع الأولى.)
4. **Given** الكمية في الفاتورة 50 واللي اتعدّ 48، **When** يراجع الإذن، **Then** السطر يتعلّم بفرق 2، وزرار "اعتماد" ميشتغلش غير لما يكتب سبب الفرق. بعد الاعتماد، الرصيد يزيد 48 والفرق يتسجل على الإذن بسببه.
5. **Given** إنه كتب سعر غير آخر سعر شراء، **When** يكتبه، **Then** الخانة تتعلّم ويظهر السعر القديم جنبها. بعد الاعتماد، سعر الصنف يبقى السعر الجديد.
6. **Given** إذن مسودة، **When** يقفل البرنامج ويرجع، **Then** يلاقي المسودة زي ما سابها، ويقدر يعدّل أو يمسح أي سطر فيها.
7. **Given** إذن معتمد، **When** يفتحه، **Then** يشوف ختم "معتمد" بالتاريخ ورقم الإذن، ومفيش أي خانة تتعدّل.

---

### User Story 3 - الصرف للمندوب بالبدائل (Priority: P1)

المندوب جاب مجموعة أذون مرضى. أمين المخزن بيفتح "دفعة صرف"، ويكتب اسم المندوب وأرقام الأذون، ويضيف الأصناف المطلوبة وكمياتها، والبرنامج بيجمعها. قدام كل صنف بيشوف المطلوب واللي هيتسلّم والرصيد. لو صنف ناقص، بيختار بديل من نفس الفئة بأقرب سعر، أو بيصرف بالسالب ويكتب السبب. وفي الآخر بيعتمد الدفعة.

**Why this priority**: ده الشغل اليومي التاني الأساسي. وتسجيل البديل وقت الصرف بيقفل مصدر العجز اللي بيظهر في الجرد النهارده.

**Independent Test**: نعمل دفعة صرف فيها صنف متاح بالكامل، وصنف ناقص 2 نختارله بديل، ونعتمد. نتأكد إن الخصم حصل من الصنف البديل، وإن الحركة مكتوب عليها "بدل" الصنف الأصلي، وإن ملخص القيمة صح.

**Acceptance Scenarios**:

1. **Given** دفعة صرف مفتوحة، **When** يضيف نفس الصنف من أكتر من إذن، **Then** الكميات تتجمع في سطر واحد.
2. **Given** صنف مطلوب منه 6 ورصيده 4، **When** يفتح السطر، **Then** يظهر "ناقص 2"، والدفعة متتعمدش غير لما الناقص يتغطى ببديل، أو يتصرف بالسالب بسبب مكتوب، أو الكمية تتقلّل.
3. **Given** صنف ناقص، **When** يدوس "بديل"، **Then** تظهر الأصناف اللي من **نفس الفئة** وليها رصيد، مترتبة من الأقرب سعراً للأبعد، وقدام كل واحد سعره وفرقه بالجنيه وبالنسبة ورصيده. وفيه اختيار "كل الفئات" للحالات الاستثنائية، زي طقم DHS (مسمار نخاعي وشريحة).
4. **Given** إنه اختار بديل، **When** يعتمد، **Then** الحركة بتخصم من **البديل** (اللي خرج فعلاً)، ومتسجل عليها "بدل [الصنف الأصلي]"، ورصيد الصنف الأصلي ميتأثرش.
5. **Given** إنه اختار يصرف أكتر من الرصيد، **When** يأكد ويكتب السبب، **Then** الصرف يتسجل، والصنف يبقى رصيده بالسالب ويدخل قائمة "تسويات معلّقة" اللي بتظهر في الرئيسية لحد ما يتسوّى.
6. **Given** الدفعة جاهزة، **When** يراجع الملخص، **Then** يشوف قيمة المطلوب، وقيمة اللي اتسلّم فعلاً، والفرق بالجنيه.
7. **Given** دفعة معتمدة، **When** يفتحها، **Then** يشوف ختم "معتمد" بالتاريخ ورقم الدفعة، وأرقام الأذون، والبدائل.
8. **Given** الصنف ليه أكتر من تشغيلة، **When** يتصرف، **Then** البرنامج يختار الأقرب انتهاءً لوحده، ويقدر أمين المخزن يغيّرها.

---

### User Story 4 - الأصناف والأرصدة وكارت الصنف (Priority: P2)

أمين المخزن بيدوّر على صنف بأي طريقة (رقم الصفحة، أو الكود، أو الباركود، أو جزء من الاسم)، ويشوف رصيده وحالته وتشغيلاته، وكارت فيه كل حركاته.

**Why this priority**: بيحل محل شيتات "الأرصدة اللحظية" و"كارت صنف"، وبيستخدمه كل يوم. بس الاستلام والصرف أهم منه.

**Independent Test**: نفتح كارت صنف ليه حركات إضافة وصرف وبديل وإلغاء، ونتأكد إن كل الحركات ظاهرة بالرصيد بعد كل حركة.

**Acceptance Scenarios**:

1. **Given** قائمة الأصناف، **When** يفلتر بـ "تحتاج طلب" أو "نافد" أو "تسويات معلّقة" أو فئة معينة، **Then** تظهر الأصناف دي بس.
2. **Given** صنف، **When** يفتح الكارت بتاعه، **Then** يشوف بياناته، ورصيده، وحالته، وحد الطلب، ورصيد كل تشغيلة وصلاحيتها، وكل حركة بتاريخها ونوعها وكميتها وسعرها وقتها ورقم الإذن والرصيد بعدها. الحركة الملغية بتظهر مشطوبة ومربوطة بالحركة العكسية بتاعتها.
3. **Given** حالة الصنف، **Then** بتتحدد بنفس قواعد الإكسيل: رصيد أقل من صفر = "تجاوز — رصيد سالب"، صفر = "نافد"، أقل من أو يساوي حد الطلب = "يحتاج طلب"، غير كده = "متاح".
4. **Given** بيانات صنف (السعر، أو الـ GTIN، أو الاسم، أو حد الطلب اليدوي)، **When** يعدّلها، **Then** التعديل يتحفظ مع وقته، والحركات القديمة ميتغيرش سعرها.
5. **Given** صنف جديد مش في القائمة، **When** يضيفه، **Then** ياخد كود ورقم صفحة جديدين ميتكرروش.

---

### User Story 5 - إلغاء حركة، ومرتجع، وتسوية (Priority: P2)

أمين المخزن اكتشف غلط في إذن معتمد، أو المندوب رجّع صنف، أو محتاج يسوّي رصيد.

**Why this priority**: لازمة عشان الدفتر يفضل صح من غير ما حد يعدّل في حركة معتمدة.

**Independent Test**: نلغي دفعة صرف معتمدة ونتأكد إن الأرصدة رجعت زي ما كانت، وإن الحركتين ظاهرين في كارت الصنف.

**Acceptance Scenarios**:

1. **Given** إذن أو دفعة معتمدة، **When** يدوس "إلغاء" ويكتب السبب، **Then** تتسجل حركات عكسية مربوطة بالأصلية، والأرصدة ترجع، والأصل يظهر "ملغي" بختم أحمر.
2. **Given** إن المندوب رجّع قطع، **When** يسجل "مرتجع" بالصنف والكمية والسبب، **Then** الرصيد يزيد.
3. **Given** صنف عليه تسوية معلّقة، **When** يسجل "تسوية" بكمية موجبة أو سالبة وسبب، **Then** الرصيد يتعدّل، والصنف يخرج من القائمة لو الرصيد بقى صفر أو أكتر.
4. **Given** أي حركة معتمدة، **When** أي حد يحاول يعدّلها أو يمسحها بأي طريقة (حتى من برّه البرنامج)، **Then** المحاولة ترفض.

---

### User Story 6 - المطبوعات والتصدير للإكسيل والنسخة الاحتياطية (Priority: P2)

أمين المخزن عاوز يطبع إذن الاستلام وإذن الصرف، وينقل الحركات الجديدة لملف الإكسيل في فترة التجربة، وياخد نسخة احتياطية.

**Why this priority**: من غيرها الورق مش هيختفي، والإكسيل مش هيتراجع عليه في فترة التجربة.

**Independent Test**: نعتمد إذن استلام، ونطلّع ملف الطباعة، ونفتحه في إكسيل ونطبعه. وبعدها ننقل سطور الحركات لنسخة من ملف الإكسيل، ونتأكد إن الأرصدة في الإكسيل بقت زي البرنامج.

**Acceptance Scenarios**:

1. **Given** إذن استلام أو دفعة صرف معتمدة، **When** يدوس "طباعة"، **Then** ينزل ملف إكسيل جاهز للطباعة على ورقة A4. فوقه "وزارة الصحة والسكان / مديرية الشئون الصحية بالقليوبية / مستشفى القناطر الخيرية"، وفيه رقم الإذن والتاريخ والشركة أو المندوب، وجدول الأصناف (رقم الصفحة، والاسم، والتشغيلة، والصلاحية، والكمية، والسعر، والقيمة)، والإجمالي، وخانات إمضاء أمين المخزن والمندوب.
2. **Given** حركات اتسجلت في البرنامج من آخر تصدير، **When** يدوس "سطور لسجل الحركات"، **Then** يطلع ملف فيه الحركات دي بنفس ترتيب أعمدة جدول "الحركات" في الإكسيل. لما ينقلها للإكسيل، أعمدة المعادلات تفضل شغالة، ورصيد كل صنف في الإكسيل يطابق البرنامج.
3. **Given** آخر نسخة احتياطية عدّى عليها أكتر من 7 أيام، **When** يفتح البرنامج، **Then** يظهرله تذكير، وبضغطة واحدة ينزل ملف إكسيل فيه كل الأصناف وكل الحركات.

---

### User Story 7 - الشغل من غير نت والمزامنة بين الموبايل واللاب (Priority: P1)

أمين المخزن بيستلم ويصرف على الموبايل وهو جوه المخزن والنت قاطع، وبعدين يفتح اللاب يلاقي كل حاجة.

**Why this priority**: النت في المخزن بيقطع، والموبايل هو الأداة الأساسية. لو حركة واحدة ضاعت، الثقة في البرنامج تضيع.

**Independent Test**: نقطع النت عن الموبايل، ونعتمد إذن استلام ودفعة صرف، ونرجّع النت، ونتأكد إن الاتنين ظهروا على اللاب بنفس الأرصدة.

**Acceptance Scenarios**:

1. **Given** مفيش نت، **When** يعمل أي حاجة (بحث، استلام، صرف، اعتماد، طباعة)، **Then** كله يشتغل، ومؤشر المزامنة يقول "N حركة مستنية النت".
2. **Given** حركات مستنية، **When** النت يرجع، **Then** الحركات تتبعت لوحدها والمؤشر يبقى "متزامن"، من غير أي خطوة منه.
3. **Given** الموبايل واللاب سجّلوا حركات على نفس الصنف وهما من غير نت، **When** الاتنين يتزامنوا، **Then** الحركتين يتحفظوا الاتنين، والرصيد يتحسب منهم. ولو الرصيد بقى بالسالب، الصنف يدخل "تسويات معلّقة" ويفضل منوّر لحد ما يتفتح.
4. **Given** حد غير صاحب الحساب، **When** يحاول يفتح البرنامج أو يوصل للداتا، **Then** يترفض.

### Edge Cases

- الباركود اللي اتصوّر شكله صح بس مش متسجل على أي صنف: البرنامج يسأل "ده أنهي صنف؟". لو الـ GTIN متسجل على صنف تاني، يحذّر قبل ما يربطه.
- رقم الصفحة اللي اتكتب مش موجود: رسالة "مفيش صنف بالرقم ده".
- خانة البحث فيها كلام يطابق أكتر من صنف: قايمة يختار منها، ومفيش اختيار تلقائي.
- صلاحية التشغيلة قبل تاريخ النهارده وقت الاستلام: تحذير واضح، وممكن يكمّل بسبب.
- كمية صفر أو سالبة في الاستلام أو الصرف: ممنوعة.
- مفيش بديل من نفس الفئة ليه رصيد: يظهر "مفيش بديل متاح"، ويفضل قدامه اختيار "كل الفئات" أو "صرف بالسالب + سبب".
- الكاميرا مرفوضة أو مش موجودة (زي اللاب): الكتابة بتشتغل عادي، والكاميرا بتختفي.
- استيراد ملف مختلف أو ناقص شيتات: رسالة بالشيت أو العمود الناقص، ومفيش حاجة تتسجل.
- الحركات القديمة في الإكسيل من غير تشغيلة: بتتحط تحت "تشغيلة غير محددة"، والصرف منها مسموح.
- جدول "الحركات" في الإكسيل مساحته لحد الصف 595، والمستخدم منه 237 سطر: البرنامج ينبّه لما السطور الجديدة تقرّب تملا المساحة الفاضية.
- التاريخ اللي اختاره المستخدم للحركة في المستقبل: ممنوع.
- إلغاء حركة اتلغت قبل كده: ممنوع.

## Requirements *(mandatory)*

### Functional Requirements

**الاستيراد والمطابقة**
- **FR-001**: System MUST import items from sheet "القائمة الاساسية" and movements from table "الحركات" in sheet "سجل الحركات" of the user's workbook, keeping codes, page numbers, categories, names, material, size, unit, supplier, GTIN, price, dates, types, quantities, permit/invoice numbers, notes, references, batch numbers, and expiry dates.
- **FR-002**: System MUST NOT add a separate opening-balance movement from the item sheet's "الرصيد الافتتاحي" column, because opening balances already exist in the ledger as إضافة movements noted "رصيد افتتاحي".
- **FR-003**: System MUST show a parity screen comparing each item's balance with the cached "الرصيد الحالي" value of sheet "الأرصدة اللحظية", with a count of matching items.
- **FR-004**: System MUST prevent importing the same workbook history twice.
- **FR-005**: The 6 movements dated 2026-01-08 in the workbook (ledger rows 232, 237 and 240–243: 2 إضافة, 4 صرف) MUST be imported with the date 2026-08-01. The user confirmed on 2026-10-12 that the workbook date is a day/month entry error. With the corrected date, months of consumption becomes 2 instead of 9.

**الأصناف والأرصدة**
- **FR-010**: System MUST compute each item's balance as إضافة − صرف + مرتجع + تسوية (تسوية is signed), exactly as the workbook does.
- **FR-011**: System MUST compute each item's status with the workbook's thresholds: balance < 0 → "تجاوز — رصيد سالب"; = 0 → "نافد"; ≤ reorder point → "يحتاج طلب"; otherwise "متاح".
- **FR-012**: System MUST compute the reorder point as in the workbook: the manual value if set and greater than 0 (the workbook tests `N(R) > 0`); else, if the item has issues, max(1, round up(total issued ÷ months of consumption × 1.5)); else the default 5. Months of consumption = max(1, round((latest movement date − earliest movement date) ÷ 30)). The coverage (1.5 months) and the default (5) MUST be editable settings.
- **FR-013**: System MUST keep a balance per batch (item + batch + expiry). Imported movements without a batch go to an "unspecified batch".
- **FR-014**: Users MUST be able to add an item and edit item master data; codes and page numbers MUST be unique. Item edits MUST NOT change prices stored on past movements.
- **FR-015**: An item MUST be able to hold more than one GTIN.
- **FR-016**: An item MUST be able to hold its authority code (كود الهيئة, the 8–9 digit item code printed on the Unified Procurement Authority's delivery note, e.g. `70000409`). Authority codes are unique across items.
- **FR-017**: Users MUST be able to load authority codes for existing items from an owner-reviewed mapping file (item code → authority code). The file is prepared from the supplier's authority contract list and confirmed by the owner before import; unconfirmed rows are skipped.

**البحث**
- **FR-020**: One search input MUST accept a camera barcode scan or typed text, and resolve it by its shape: a number of 8–9 digits is looked up as **both** a GTIN and an authority code (if it matches two different items, the user chooses); 12–14 digits → GTIN; a number of 1–4 digits → page number; three letters, a dash and 2–3 digits → item code; anything else → name search (Arabic or English).
- **FR-021**: Name search with more than one match MUST show a list; the system MUST NOT pick automatically.

**الاستلام**
- **FR-030**: A receipt MUST carry supplier, delivery-note number (رقم الإذن), invoice number and invoice date, supply request number (طلب إمداد) and supply order number (أمر توريد) when present, business date, and lines (item, authority code as printed, batch, manufacture date (optional), expiry, invoiced quantity, counted quantity, unit price, difference reason).
- **FR-030b**: Scanning the QR code on the delivery note MUST fill the delivery-note number (the QR holds only that number, confirmed by the owner on 2026-10-12). If a receipt with the same delivery-note number already exists, the system MUST open it instead of creating a duplicate.
- **FR-030a**: The unit price recorded for a receipt line, and therefore the item's current price, MUST be the price **after** the purchase fee (سعر الوحدة بعد رسم الشراء), as printed on the delivery note.
- **FR-031**: Unit price MUST prefill with the item's latest purchase price; a different price MUST be visibly flagged with the previous price shown.
- **FR-032**: A line whose counted quantity differs from the invoiced quantity MUST require a reason before posting. Stock increases by the counted quantity.
- **FR-033**: An unknown GTIN MUST prompt the user to choose an item; on posting, the GTIN is linked to that item. Linking a GTIN already held by another item MUST warn first.
- **FR-034**: Posting a receipt MUST update each received item's current price to the receipt's unit price.

**الصرف**
- **FR-040**: An issue batch MUST carry representative name, business date, the list of patient permit numbers (numbers only), requested lines, and issued lines.
- **FR-041**: Requested quantities of the same item MUST aggregate into one line.
- **FR-042**: For a short line, the substitute list MUST show in-stock items of the same category ordered by absolute price difference, each with price, difference in EGP and percent, and balance. An "all categories" option MUST be available.
- **FR-043**: An issued substitute MUST be recorded as an issue of the substitute item, carrying a reference to the requested item ("بدل …"). The requested item's balance MUST NOT change.
- **FR-044**: Issuing beyond balance MUST require explicit confirmation and a reason; the item then appears in "تسويات معلّقة" until its balance is zero or more.
- **FR-045**: The batch summary MUST show requested value, issued value, and their difference.
- **FR-046**: Issue lines MUST default to the earliest-expiring batch with stock; the user can change it.

**الدفتر والاعتماد**
- **FR-050**: Receipts and issue batches MUST start as drafts that are editable and do not affect balances; posting (اعتماد) creates the movements.
- **FR-051**: Posted movements MUST be immutable: no edit and no delete, enforced by the data store's access rules, not only the interface.
- **FR-052**: Cancelling a posted document MUST create reversing movements linked to the originals, with a reason; both remain visible. A movement can be reversed only once.
- **FR-053**: Users MUST be able to record a return (مرتجع, increases stock) and an adjustment (تسوية, signed quantity), each with a reason.
- **FR-054**: Every movement MUST store its business date, posting time, unit price at posting, and the document it came from.
- **FR-055**: A posted document MUST display an approval seal with date and document number. The seal colour MUST be used for nothing else.

**المطبوعات والتصدير**
- **FR-060**: System MUST produce a printable A4 Excel file for each posted receipt and issue batch, with the official header, document details, line table, total, and signature boxes.
- **FR-061**: System MUST export movements posted since the last export as rows in the column order of the workbook's "الحركات" table, so they can be added to the workbook without breaking its formula columns, and so the workbook's balances then equal the app's.
- **FR-062**: System MUST export a full backup (all items and movements) as an Excel file, and remind the user when the last backup is older than 7 days.

**الأوفلاين والوصول**
- **FR-070**: Every function in this spec MUST work offline and sync automatically when connectivity returns, without losing data.
- **FR-071**: Sync status MUST be visible on every screen: "متزامن" or "N حركة مستنية النت".
- **FR-072**: Movements made on two devices while offline MUST all be kept after sync. A balance that turns negative after sync MUST flag the item as a pending settlement and highlight it until opened.
- **FR-073**: Only the owner's account MUST be able to read or write any data.
- **FR-074**: The interface MUST be Arabic, right to left, using the workbook's terms, and usable on a phone and a laptop.

### Key Entities *(include if feature involves data)*

- **الصنف (Item)**: كود، رقم صفحة، فئة، اسم عربي، اسم إنجليزي، خامة، مقاس، وحدة، شركة موردة، GTIN (واحد أو أكتر)، كود الهيئة (اختياري)، سعر حالي (آخر سعر شراء)، حد طلب يدوي (اختياري)، حالة نشاط.
- **الحركة (Movement)**: النوع (إضافة، صرف، مرتجع، تسوية)، الصنف، الكمية، تاريخ الحركة، وقت الاعتماد، السعر وقتها، التشغيلة، الصلاحية، رقم الإذن أو الفاتورة، المرجع، الملاحظات، المستند اللي جاية منه، "بدل صنف" (اختياري)، "عكس حركة" (اختياري). متتعدلش بعد الاعتماد.
- **إذن الاستلام (Receipt)**: الشركة، رقم إذن التسليم، رقم الفاتورة وتاريخها، طلب الإمداد، أمر التوريد، التاريخ، الحالة (مسودة، معتمد، ملغي)، السطور (الصنف، التشغيلة، الصلاحية، الكمية في الفاتورة، الكمية المعدودة، السعر، سبب الفرق).
- **دفعة الصرف (Issue Batch)**: رقم الدفعة، اسم المندوب، التاريخ، أرقام أذون المرضى، الحالة، السطور المطلوبة، السطور المصروفة (مع البديل لو موجود).
- **التشغيلة (Batch)**: الصنف، رقم التشغيلة، الصلاحية. رصيدها بيتحسب من الحركات.
- **الإعدادات (Settings)**: مدة التغطية لحد الطلب (1.5 شهر)، والحد الافتراضي (5)، وتاريخ آخر نسخة احتياطية، وتاريخ آخر تصدير لسجل الحركات.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: بعد استيراد ملف الإكسيل الحالي، رصيد الـ 97 صنف (100%) يطابق عمود "الرصيد الحالي" في شيت "الأرصدة اللحظية". وبعد ما المستخدم يصلّح تاريخ الحركات الـ 6 في الإكسيل لـ 1 أغسطس، حالة كل صنف وحد الطلب بتاعه يطابقوا الإكسيل كمان.
- **SC-002**: طول فترة التجربة، بعد نقل سطور الحركات للإكسيل، رصيد كل صنف في الإكسيل يطابق البرنامج (100% من الأصناف، في كل مرة).
- **SC-003**: تسجيل سطر استلام لصنف معروف ياخد أقل من 30 ثانية بالكاميرا، وأقل من 45 ثانية بالكتابة.
- **SC-004**: دفعة صرف فيها 10 أذون وصنف واحد محتاج بديل تتقفل وتتعمد في أقل من 5 دقايق.
- **SC-005**: صفر حركات ضايعة: كل حركة تتعمد من غير نت تظهر على الجهاز التاني بعد ما النت يرجع، في 100% من التجارب.
- **SC-006**: صفر حركات معتمدة اتعدّلت أو اتمسحت: كل محاولة تعديل أو مسح من برّه البرنامج بتترفض.
- **SC-007**: ملفات الطباعة بتتفتح وتتطبع على A4 من غير أي تعديل بالإيد.
- **SC-008**: كل بديل اتصرف ليه أثر مكتوب: الصنف الأصلي، والبديل، والكمية، وفرق القيمة، وده يظهر في 100% من البدائل.
- **SC-009**: بعد شهر من الاستخدام، أمين المخزن مابيكتبش أذون الاستلام والصرف بالإيد.

## Assumptions

- مستخدم واحد بس (أمين المخزن) بحساب واحد. مفيش صلاحيات ولا مستخدمين تانيين في المرحلة دي.
- مفيش بيانات مرضى. أذون المرضى بتتسجل بأرقامها بس.
- النت على الموبايل جوه المخزن بيقطع، وعلى اللاب موجود في الغالب.
- الكاميرا هتستخدم الموبايل الأندرويد بتاع المستخدم. على اللاب البحث بالكتابة بس.
- الحركات القديمة اللي ملاحظتها "تسوية عجز الجرد" (35 حركة) متسجلة في الإكسيل كـ "صرف"، فهتتستورد زي ما هي كـ "صرف" عشان المطابقة. أي تسوية جديدة بعد كده هتتسجل كـ "تسوية".
- الإلغاء بيتسجل كحركة تسوية بعكس الكمية ومربوط بالحركة الأصلية، عشان يتنقل للإكسيل كسطر عادي يحسب صح.
- المرتجع هو قطع راجعة من المندوب للمخزن.
- "نفس الفئة" معناها نفس قيمة عمود "الفئة" في القائمة الأساسية. شيت "بدائل محتملة" بيأكد إن البدائل غالباً من نفس الفئة (كلهم ماعدا طقم DHS)، وعشان كده "كل الفئات" اختيار يدوي مش افتراضي.
- مطبوعات إذن الاستلام وإذن الصرف مالهاش نموذج حكومي متاح، فهتتصمم من بيانات الإذن بالهيدر الرسمي. لو المستخدم جاب نموذج رسمي بعدين، هيتطابق عليه.
- الكشف الشهري وكروت التعريف (المرحلة 2) والجرد والعجوزات والزيادات (المرحلة 3) برّه نطاق المرحلة دي. وفي فترة التجربة هيطلعوا من الإكسيل.
- أسعار الأصناف في الإكسيل مش متسقة: في أصناف سعرها بعد رسم الشراء 5% (زي 4,121.34 = 3,925.09 × 1.05)، وأصناف بسعر العقد من غير رسم. البرنامج بيستورد السعر زي ما هو عشان المطابقة، وكل استلام جديد بيحدّث السعر للسعر بعد الرسم (FR-030a)، فالأسعار هتتظبط مع الطلبيات الجديدة.
- إذن التسليم الحقيقي (مثال: إذن 19808953 من الهيئة المصرية للشراء الموحد، المورد المركز الدولي) فيه: كود الصنف (كود الهيئة)، والـ GTIN، والتشغيلة، وتاريخ الصنع والانتهاء، والكمية، والسعر قبل وبعد رسم الشراء، ورقم الفاتورة وتاريخها، وطلب الإمداد، وأمر التوريد، وQR كود فيه رقم الإذن بس.
- سطور سجل الحركات هتتسلّم في ملف إكسيل صغير، لأن نسخ نص من المتصفح ولزقه ممكن يكتب فوق أعمدة المعادلات. الطريقة المظبوطة للصق هتتحدد في الخطة بتجربة على نسخة من الملف.
