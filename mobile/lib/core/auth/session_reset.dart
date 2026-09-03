import 'package:flutter/foundation.dart';

/// Bumped by [AuthController] on every successful sign-in so main.dart can
/// remount the whole `ProviderScope` and drop every screen's cached data —
/// without this, signing out and back in as a different account (exactly
/// what manual role-by-role testing does) left Home, Timetable, Fees and
/// every other tab showing the previous account's data, since each is a
/// plain `FutureProvider` with no dependency on who's signed in.
///
/// A plain `ValueNotifier` rather than a Riverpod provider: the thing it
/// drives (the `ProviderScope` itself) sits above every container that could
/// otherwise hold it.
final sessionGeneration = ValueNotifier<int>(0);
