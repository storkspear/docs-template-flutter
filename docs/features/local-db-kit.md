<a id="local_db_kit"></a>

# local_db_kit

파생 앱의 Drift 데이터베이스를 provider로 제공하고 부팅 시 초기화를 확인해요. 테이블과 마이그레이션은 파생 앱의 `AppDatabase`에서 정의해요. Kit에 데이터베이스 팩터리를 넘기면 provider와 부팅 단계가 같은 인스턴스를 재사용해요.

---

## 개요

Drift 로 테이블과 쿼리를 Dart 에서 정의하고 build_runner 로 필요한 코드를 생성해요. DbMigrationStep 은 DB 를 열어 초기화를 확인하며, 스키마 생성·갱신은 파생 앱의 AppDatabase 에 정의한 Drift 마이그레이션이 처리해요. 템플릿에는 DB 스키마 회귀 테스트가 없어요. 라이브러리의 지원 플랫폼과 이 템플릿이 검증한 Android·iOS 범위는 구분해요.

---

## 활성화

```yaml
# app_kits.yaml
kits:
  local_db_kit:
    database_class: AppDatabase
    database_file: lib/database/app_database.dart
```

```dart
// lib/main.dart
await AppKits.install([
  LocalDbKit(database: () => AppDatabase()),  // ← factory 함수 (lazy 초기화)
  // ...
]);
```

> `database`에는 `GeneratedDatabase Function()` 팩터리를 넘겨요. provider를 처음 읽거나 부팅 단계가 실행될 때 인스턴스를 만들고 캐시하므로 두 경로가 같은 DB를 사용해요.

---

## 제공 기능

| 항목 | 설명 |
|------|------|
| `LocalDbKit` | `AppKit` 구현. `DbMigrationStep` BootStep 기여 |
| `DbMigrationStep` | 부팅 시 스키마 버전 체크 · 마이그레이션 |
| `lazyNativeDatabase` | SQLite 파일 lazy 초기화 헬퍼 |
| (파생 레포) `AppDatabase` | Drift 생성 DAO · 테이블 |

---

## 파생 레포 워크플로우

### 1. 테이블 정의

```dart
// lib/database/tables/expenses.dart
import 'package:drift/drift.dart';

class Expenses extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get title => text().withLength(min: 1, max: 100)();
  IntColumn get amount => integer()();
  DateTimeColumn get expenseDate => dateTime()();
  DateTimeColumn get createdAt => dateTime().clientDefault(() => DateTime.now())();
}
```

### 2. 데이터베이스 클래스

```dart
// lib/database/app_database.dart
import 'package:drift/drift.dart';
import 'package:app_template/kits/local_db_kit/db_paths.dart';
import 'tables/expenses.dart';

part 'app_database.g.dart';

@DriftDatabase(tables: [Expenses])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(lazyNativeDatabase('app.sqlite'));

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) => m.createAll(),
    // schemaVersion 1에서는 onCreate로 테이블을 만들어요.
  );

  Future<List<Expense>> allExpenses() => select(expenses).get();
  Future<int> insertExpense(ExpensesCompanion data) => into(expenses).insert(data);
}
```

### 3. 코드 생성

```bash
dart run build_runner build --delete-conflicting-outputs
```

생성 파일은 `app_database.g.dart` 예요. 예제의 `package:app_template/` 는 rename 후 `pubspec.yaml` 에 지정된 Dart 패키지명으로 바꿔요.

### 4. Provider 접근

`LocalDbKit` 이 install 시점에 `databaseProvider` 를 override 해서 DB 인스턴스를 주입해요. **새 `AppDatabase()` 를 직접 만들지 마세요** — kit 이 관리하는 인스턴스와 별개로 DB 가 2개 생겨요.

```dart
// feature 에서 바로 사용
final db = ref.watch(databaseProvider) as AppDatabase;

// (권장) 타입 안전 접근용 파생 Provider — lib/common/providers.dart 에서 확장
final appDatabaseProvider = Provider<AppDatabase>(
  (ref) => ref.watch(databaseProvider) as AppDatabase,
);
```

### 5. Repository 에서 사용

```dart
class ExpenseRepository {
  final AppDatabase _db;
  ExpenseRepository(this._db);

  Future<List<Expense>> list() => _db.allExpenses();

  Future<int> add(String title, int amount, DateTime date) {
    return _db.insertExpense(ExpensesCompanion.insert(
      title: title,
      amount: amount,
      expenseDate: date,
    ));
  }
}
```

---

## 마이그레이션

스키마 변경 시 `schemaVersion` 올리고 `onUpgrade` 마이그레이션을 작성하세요 (파생 레포의 `AppDatabase` 에 정의).

> ⚠️ 템플릿엔 Drift schema fingerprint 테스트가 **없어요**. 스키마 회귀를 자동 감지하고 싶으면 파생 레포에서 `drift_dev schema dump` 기반 테스트를 직접 추가하세요. (`test/migration_fingerprint/` 의 기존 파일들은 Drift 가 아니라 recipe 재구성 회귀 테스트라 `flutter test` 로 돌아가요 — `test` 패키지/`-u` 갱신 메커니즘은 없어요.)

---

## 파생 레포 체크리스트

- [ ] `pubspec.yaml` 에 `drift_dev` · `build_runner` dev_dependencies
- [ ] `lib/database/app_database.dart` 작성 (DAO · 테이블)
- [ ] `dart run build_runner build` 실행
- [ ] `lib/main.dart` 에서 `LocalDbKit(database: () => AppDatabase())` 전달 (factory 함수)
- [ ] 초기 실행 시 DB 파일 생성 확인 (Android · iOS 모두 앱 Documents 디렉토리 — `getApplicationDocumentsDirectory()`)
- [ ] 테이블 변경 시: `schemaVersion` 올림 + `onUpgrade` 작성

---

## Code References

- [`lib/kits/local_db_kit/local_db_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/local_db_kit/local_db_kit.dart)
- [`lib/kits/local_db_kit/db_migration_step.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/local_db_kit/db_migration_step.dart)
- [`lib/kits/local_db_kit/db_paths.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/local_db_kit/db_paths.dart) — `lazyNativeDatabase()` 헬퍼 정의
- [`lib/kits/local_db_kit/db_providers.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/local_db_kit/db_providers.dart) — `databaseProvider` 정의

---

## 관련 문서

- [Drift 공식 문서](https://drift.simonbinder.eu/)
- [`Testing Conventions`](../testing/testing-strategy.md) — 테스트 전략 전반
