import SwiftUI

/**
 No workout running: the routines to start one from, as the phone lists them.
 Starting here is the same as starting on the phone, and the phone's logger
 shows the workout as soon as it hears of it. An empty workout is started on
 the phone, where the exercise library is.
 */
struct StartView: View {
  @EnvironmentObject private var store: WatchStore

  var body: some View {
    NavigationStack {
      List {
        if !store.signedIn {
          Message(text: store.label("openPhone"))
        } else if store.routines.isEmpty {
          Message(text: store.label("noRoutines"))
        } else {
          Section(store.label("routines")) {
            ForEach(store.routines) { routine in
              NavigationLink(value: routine.id) {
                VStack(alignment: .leading, spacing: 2) {
                  Text(routine.name)
                    .font(.system(.headline, design: .rounded))
                    .lineLimit(2)
                  Text(routine.exercises.map(\.name).joined(separator: ", "))
                    .font(.caption2)
                    .foregroundStyle(Palette.muted)
                    .lineLimit(2)
                }
                .padding(.vertical, 2)
              }
            }
          }
        }
      }
      .navigationTitle("RiceCal")
      .navigationDestination(for: String.self) { id in
        if let routine = store.routines.first(where: { $0.id == id }) {
          RoutinePreview(routine: routine)
        }
      }
    }
  }
}

private struct Message: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.footnote)
      .foregroundStyle(Palette.muted)
      .listRowBackground(Color.clear)
  }
}

/// A routine's exercises, with Start above them where the thumb is.
struct RoutinePreview: View {
  @EnvironmentObject private var store: WatchStore
  let routine: WatchRoutine

  var body: some View {
    List {
      Button {
        store.start(routine)
      } label: {
        Label(store.label("start"), systemImage: "play.fill")
          .font(.system(.headline, design: .rounded))
          .frame(maxWidth: .infinity)
          .foregroundStyle(Palette.onPandan)
      }
      .listRowBackground(Capsule().fill(Palette.pandan))

      ForEach(routine.exercises) { exercise in
        HStack {
          Text(exercise.name)
            .font(.footnote)
            .lineLimit(2)
          Spacer(minLength: 4)
          Text("×\(exercise.sets.count)")
            .font(.system(.footnote, design: .rounded).monospacedDigit())
            .foregroundStyle(Palette.muted)
        }
      }
    }
    .navigationTitle(routine.name)
  }
}
