import 'package:flutter/material.dart';

import 'library_catalogue_screen.dart';
import 'library_issues_screen.dart';
import '../../core/widgets/app_widgets.dart';

/// Entry point for the library desk: catalogue search/issue on one tab,
/// open issues/return/fine on the other — the same single-page desk from
/// src/app/app/library, split into two swipeable panes for a phone.
class LibraryHomeScreen extends StatelessWidget {
  const LibraryHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: const AppTopBar(
          title: 'Library',
          bottom: AppTabBar(tabs: ['Catalogue', 'Issues']),
        ),
        body: const TabBarView(
          children: [
            LibraryCatalogueScreen(embedded: true),
            LibraryIssuesScreen(embedded: true),
          ],
        ),
      ),
    );
  }
}
