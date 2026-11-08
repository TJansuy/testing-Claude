# Screens: dashboard, header, display and background

[← Back to LocalChatter](../README.md)

## The dashboard

The dashboard has two tabs:

- **✨ Effects:** the effect buttons, the **Soundboard** (admins) and **Favourites**.
- **⚙️ Settings:** your name and server, notifications, sounds, vibration, the
  header, languages, your role and who's here.

On phones it opens above the message box: ✨ opens it on Effects, the ⚙️ button
in the header (or tapping the connection status) opens it on Settings, and ×
closes it. It scrolls if it's long, with the tabs pinned at the top.

On screens 16:10 or wider and at least 960 px across (laptops, and tablets in
landscape) it's a column beside the chat that stays open. ⚙️ switches it to
Settings, and saving goes back to Effects. Narrower, 4:3 and portrait screens
keep the phone layout, and it switches live when you rotate or resize.

## The header (phones)

On phones the header slides away a few seconds after you stop using it, so
there's more room for messages. A small tab stays at the top, with a dot showing
the connection status; tap it to bring the header back. Scrolling back up
through the chat brings it back too.

It stays visible while you're not connected, while the dashboard is open, and on
wide screens. Turn it off in Settings (*On phones, hide the header after a few seconds*).

## Display

A display is a big-screen view for a TV, tablet or spare phone. It shows the
chat in large text, plays effects and sounds, and has no message box.

- Turn on **Display mode** in Settings (and off again to go back), or open
  `<app>/Display`, e.g.
  `https://tjansuy.github.io/testing-Claude/PWA/LocalChatter/Display`. Note the
  capital **D**: GitHub Pages is case-sensitive.
- Or tap **Set up as a display** on the server's setup page, or type
  `/role display` in the app.
- On a display, ⚙️ opens just the settings.
- It joins as "Display" (rename it in Settings) and keeps the screen awake
  where the browser allows.
- It shows what everyone can see: whispers to other people and monitor-only
  system messages stay hidden.
- Sound needs one tap on the screen first (*Tap to turn on sound*).
- Effects aimed at the display by an admin in debug mode, and whispered effects
  sent to it, play too.
- The display role isn't saved: opening the normal link on the same device
  gives your usual role.

## In the background

While LocalChatter is open but in the background (you've switched to another
app or tab, or the screen is off), it keeps receiving messages for as long as
the browser lets it run:

- **Notifications.** Turn on *Notify me about new messages while LocalChatter is
  in the background* in Settings. You get one notification that updates with
  the latest message and a count ("5 new messages — Bob: see you at 5").
  Whispers for other people never notify, and messages in languages you don't
  understand stay gibberish. Tapping it brings LocalChatter back.
- **Catching up.** Messages that arrive while you're away are shown when you
  come back. If more than 50 arrived, only the latest 50 are shown and the
  chat says how many older ones were skipped.
- Effects and sounds from while you were away aren't replayed: their lines
  appear, and sounds have a ▶ to play them.

How long a browser keeps a background app running is up to the browser:
Android Chrome allows several minutes; iPhone and iPad pause it almost
straight away. When it comes back, it reconnects and carries on, but anything
sent while it was paused or disconnected isn't received (the relay keeps no history).

iPhone and iPad web apps can only show notifications through internet push
(Web Push via Apple's servers), which would need the relay to store
subscriptions and an internet connection, so LocalChatter doesn't use it. The
notification option is shown as unavailable there.
