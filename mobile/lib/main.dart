import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/auth/session_reset.dart';

void main() {
  runApp(const _RootApp());
}

/// Rebuilds the whole `ProviderScope` — and with it every screen's cached
/// data — whenever [sessionGeneration] changes. See session_reset.dart for
/// why this lives outside Riverpod entirely.
class _RootApp extends StatelessWidget {
  const _RootApp();

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: sessionGeneration,
      builder: (context, generation, _) => ProviderScope(
        key: ValueKey(generation),
        child: const FlancaApp(),
      ),
    );
  }
}
