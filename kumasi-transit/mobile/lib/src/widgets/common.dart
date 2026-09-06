import 'package:flutter/material.dart';

import '../models.dart';
import '../theme.dart';

/// Yellow strip shown when the app is working from cached data or has queued work.
class StatusBanner extends StatelessWidget {
  const StatusBanner(
      {super.key, required this.text, this.action, this.actionLabel});

  final String text;
  final VoidCallback? action;
  final String? actionLabel;

  @override
  Widget build(BuildContext context) {
    return MaterialBanner(
      backgroundColor: const Color(0xFFFFF4D6),
      content: Text(text),
      leading: const Icon(Icons.cloud_off, color: Color(0xFF8A5A00)),
      actions: [
        if (action != null)
          TextButton(onPressed: action, child: Text(actionLabel ?? 'Retry')),
        if (action == null) const SizedBox.shrink(),
      ],
    );
  }
}

/// Five-segment fill indicator, red when the car is full and about to leave.
class OccupancyBar extends StatelessWidget {
  const OccupancyBar({super.key, required this.occupancy});

  final int occupancy;

  @override
  Widget build(BuildContext context) {
    final color = occupancy >= 4 ? kFullRed : kBrandGreen;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(4, (i) {
        return Container(
          width: 18,
          height: 10,
          margin: const EdgeInsets.only(right: 3),
          decoration: BoxDecoration(
            color: i < occupancy ? color : const Color(0xFFE5E7EB),
            borderRadius: BorderRadius.circular(3),
          ),
        );
      }),
    );
  }
}

class LoadingEntryTile extends StatelessWidget {
  const LoadingEntryTile({super.key, required this.entry, this.trailing});

  final LoadingEntry entry;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Card(
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: entry.isFull ? kFullRed : kBrandGreen,
          foregroundColor: Colors.white,
          child: Text('${entry.bay}',
              style: const TextStyle(fontWeight: FontWeight.bold)),
        ),
        title: Text(
            'Bay ${entry.bay}${entry.plate.isNotEmpty ? ' · ${entry.plate}' : ''}',
            style: textTheme.titleMedium),
        subtitle: Row(
          children: [
            OccupancyBar(occupancy: entry.occupancy),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '${entry.occupancyText} · ${entry.ageText}',
                style: TextStyle(
                    color: entry.isFull ? kFullRed : null,
                    fontWeight: entry.isFull ? FontWeight.w600 : null),
              ),
            ),
          ],
        ),
        trailing: trailing,
      ),
    );
  }
}

class OccupancyPicker extends StatelessWidget {
  const OccupancyPicker(
      {super.key, required this.value, required this.onChanged});

  final int? value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: List.generate(occupancyLabels.length, (i) {
        final selected = value == i;
        return ChoiceChip(
          label: Text(occupancyLabels[i]),
          selected: selected,
          selectedColor: i == 4 ? const Color(0xFFFECACA) : null,
          onSelected: (_) => onChanged(i),
          labelStyle: TextStyle(
              fontSize: 16, fontWeight: selected ? FontWeight.bold : null),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        );
      }),
    );
  }
}

String formatCachedAt(DateTime? at) {
  if (at == null) return 'never';
  final d = DateTime.now().toUtc().difference(at.toUtc());
  if (d.inMinutes < 1) return 'just now';
  if (d.inHours < 1) return '${d.inMinutes} min ago';
  if (d.inDays < 1) return '${d.inHours} h ago';
  return '${d.inDays} d ago';
}
