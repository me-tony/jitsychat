(() => {
  const statusEl = document.getElementById('status');
  const joinPanel = document.getElementById('join-panel');
  const callPanel = document.getElementById('call-panel');
  const joinForm = document.getElementById('join-form');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const messagesEl = document.getElementById('messages');
  const participantsEl = document.getElementById('participants');
  const localTracksEl = document.getElementById('local-tracks');
  const remoteTracksEl = document.getElementById('remote-tracks');
  const toggleAudioBtn = document.getElementById('toggle-audio');
  const toggleVideoBtn = document.getElementById('toggle-video');
  const leaveBtn = document.getElementById('leave');

  const appState = {
    connection: null,
    conference: null,
    localTracks: [],
    remoteTracks: new Map(),
    participants: new Map(),
    roomName: '',
    displayName: '',
    audioMuted: false,
    videoMuted: false,
    joining: false,
    intentionalDisconnect: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 3,
    reconnecting: false,
    reconnectTimer: null
  };

  if (!window.JitsiMeetJS) {
    setStatus('Unable to load Jitsi library', 'error');
    return;
  }

  JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);
  JitsiMeetJS.init({ disableAudioLevels: true });
  setStatus('Ready to join a call', 'info');

  joinForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (appState.joining || appState.conference) {
      return;
    }

    const formData = new FormData(joinForm);
    const rawRoom = (formData.get('room') || '').toString().trim();
    const room = rawRoom
      .normalize('NFKD')
      .replace(/[^\p{Letter}\p{Number}_-]+/gu, '')
      .slice(0, 64);
    const name = (formData.get('displayName') || '').toString().trim();

    if (!room || !name) {
      setStatus('Room name and display name are required', 'error');
      return;
    }

    if (room !== rawRoom) {
      setStatus(`Joining room as "${room}" (invalid characters removed).`, 'info');
    }

    appState.roomName = room;
    appState.displayName = name;
    appState.joining = true;
    appState.intentionalDisconnect = false;
    appState.reconnecting = false;
    appState.reconnectAttempts = 0;
    clearReconnectTimer();
    setStatus('Connecting…', 'info');
    joinPanel.classList.add('hidden');
    callPanel.classList.remove('hidden');
    updateParticipantsList();
    addParticipant('local', name, true);

    try {
      await connectToConference();
    } catch (error) {
      console.error(error);
      setStatus('Failed to connect. Check the console for details.', 'error');
      joinPanel.classList.remove('hidden');
      callPanel.classList.add('hidden');
      clearParticipants();
    } finally {
      appState.joining = false;
    }
  });

  chatForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!appState.conference) {
      return;
    }

    const message = chatInput.value.trim();
    if (!message) {
      return;
    }

    appState.conference.sendTextMessage(message);
    appendMessage({
      author: appState.displayName + ' (you)',
      text: message,
      isLocal: true,
      timestamp: Date.now()
    });
    chatInput.value = '';
  });

  toggleAudioBtn.addEventListener('click', async () => {
    const audioTrack = appState.localTracks.find(track => track.getType() === 'audio');
    if (!audioTrack) {
      return;
    }

    try {
      if (appState.audioMuted) {
        await audioTrack.unmute();
        appState.audioMuted = false;
        toggleAudioBtn.textContent = 'Mute audio';
      } else {
        await audioTrack.mute();
        appState.audioMuted = true;
        toggleAudioBtn.textContent = 'Unmute audio';
      }
    } catch (error) {
      console.error('Failed to toggle audio track', error);
      setStatus('Unable to toggle audio – check console.', 'error');
    }
  });

  toggleVideoBtn.addEventListener('click', async () => {
    const videoTrack = appState.localTracks.find(track => track.getType() === 'video');
    if (!videoTrack) {
      return;
    }

    try {
      if (appState.videoMuted) {
        await videoTrack.unmute();
        appState.videoMuted = false;
        toggleVideoBtn.textContent = 'Hide video';
      } else {
        await videoTrack.mute();
        appState.videoMuted = true;
        toggleVideoBtn.textContent = 'Show video';
      }
    } catch (error) {
      console.error('Failed to toggle video track', error);
      setStatus('Unable to toggle video – check console.', 'error');
    }
  });

  leaveBtn.addEventListener('click', () => {
    appState.intentionalDisconnect = true;
    disconnectConference();
  });

  window.addEventListener('beforeunload', () => {
    appState.intentionalDisconnect = true;
    disconnectConference();
  });

  function setStatus(message, kind = 'info') {
    statusEl.textContent = message;
    statusEl.dataset.kind = kind;
  }

  function addParticipant(id, name, isLocal = false) {
    appState.participants.set(id, { name, isLocal });
    updateParticipantsList();
  }

  function removeParticipant(id) {
    appState.participants.delete(id);
    updateParticipantsList();
  }

  function clearParticipants() {
    appState.participants.clear();
    updateParticipantsList();
  }

  function updateParticipantsList() {
    participantsEl.innerHTML = '';
    for (const [id, participant] of appState.participants.entries()) {
      const li = document.createElement('li');
      li.dataset.id = id;
      li.textContent = participant.name + (participant.isLocal ? ' (you)' : '');
      participantsEl.appendChild(li);
    }
  }

  async function connectToConference() {
    const domain = 'meet.jit.si';
    const connectionOptions = {
      hosts: {
        domain,
        muc: `conference.${domain}`,
        focus: `focus.${domain}`
      },
      serviceUrl: `wss://${domain}/xmpp-websocket`,
      clientNode: 'http://jitsi.org/jitsimeet',
      useStunTurn: true
    };

    const connection = new JitsiMeetJS.JitsiConnection(null, null, connectionOptions);
    appState.connection = connection;

    connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED, onConnectionSuccess);
    connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_FAILED, onConnectionFailed);
    connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED, onConnectionDisconnected);

    connection.connect();
  }

  function onConnectionSuccess() {
    setStatus('Connected. Joining room…', 'success');

    const conferenceOptions = {
      openBridgeChannel: true,
      p2p: {
        enabled: true
      }
    };

    const conference = appState.connection.initJitsiConference(appState.roomName, conferenceOptions);
    appState.conference = conference;
    conference.setDisplayName(appState.displayName);
    appState.reconnectAttempts = 0;
    appState.reconnecting = false;
    clearReconnectTimer();

    conference.on(JitsiMeetJS.events.conference.TRACK_ADDED, track => {
      if (track.isLocal()) {
        return;
      }
      attachRemoteTrack(track);
    });

    conference.on(JitsiMeetJS.events.conference.TRACK_REMOVED, track => {
      detachRemoteTrack(track);
    });

    conference.on(JitsiMeetJS.events.conference.MESSAGE_RECEIVED, (id, message, timestamp) => {
      const participant = appState.participants.get(id);
      appendMessage({
        author: participant ? participant.name : 'Guest',
        text: message,
        timestamp: timestamp || Date.now(),
        isLocal: false
      });
    });

    conference.on(JitsiMeetJS.events.conference.USER_JOINED, id => {
      const participant = conference.getParticipantById(id);
      const name = participant?.getDisplayName() || `Guest ${id.slice(-4)}`;
      addParticipant(id, name, false);
      refreshRemoteTrackLabels(id);
    });

    conference.on(JitsiMeetJS.events.conference.USER_LEFT, id => {
      removeParticipant(id);
      removeRemoteParticipantTracks(id);
    });

    conference.on(JitsiMeetJS.events.conference.DISPLAY_NAME_CHANGED, (id, name) => {
      if (!appState.participants.has(id)) {
        addParticipant(id, name || `Guest ${id.slice(-4)}`);
      } else {
        appState.participants.set(id, { ...appState.participants.get(id), name: name || `Guest ${id.slice(-4)}` });
        updateParticipantsList();
      }
      refreshRemoteTrackLabels(id);
    });

    conference.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, () => {
      appState.joining = false;
      setStatus(`In room ${appState.roomName}`, 'success');
      conference.getParticipants().forEach(participant => {
        const id = participant.getId();
        const name = participant.getDisplayName() || `Guest ${id.slice(-4)}`;
        if (!appState.participants.has(id)) {
          addParticipant(id, name, false);
        }
        refreshRemoteTrackLabels(id);
      });
    });

    conference.on(JitsiMeetJS.events.conference.CONFERENCE_FAILED, error => {
      const friendlyMessage = describeConferenceFailure(error);
      console.error('Conference failed', error, friendlyMessage);
      appState.intentionalDisconnect = true;
      disconnectConference({ preserveStatus: true, skipConnectionDisconnect: true });
      setStatus(friendlyMessage, 'error');
    });

    conference.join();

    ensureLocalTracks(conference)
      .catch(error => {
        console.error('Failed to prepare local tracks', error);
        setStatus('Could not access camera/microphone. Check permissions.', 'error');
      });
  }

  function onConnectionFailed(error) {
    console.error('Connection failed', error);
    if (appState.reconnecting) {
      if (appState.reconnectAttempts < appState.maxReconnectAttempts) {
        startReconnect();
      } else {
        disconnectConference({ preserveStatus: true });
        setStatus('Unable to reconnect to Jitsi. Please try joining again.', 'error');
      }
      return;
    }

    disconnectConference({ preserveStatus: true });
    setStatus('Connection failed. Please try again.', 'error');
  }

  function onConnectionDisconnected(reason) {
    console.warn('Connection disconnected', reason);
    if (appState.intentionalDisconnect) {
      appState.intentionalDisconnect = false;
      return;
    }

    startReconnect();
  }

  function ensureLocalTracks(conference) {
    if (appState.localTracks.length > 0) {
      appState.localTracks.forEach(track => {
        attachLocalTrack(track);
        conference.addTrack(track).catch(error => {
          console.warn('Failed to add existing local track to conference', error);
        });
        syncTrackMuteState(track);
      });
      return Promise.resolve();
    }

    return JitsiMeetJS.createLocalTracks({ devices: ['audio', 'video'] })
      .then(tracks => {
        tracks.forEach(track => {
          appState.localTracks.push(track);
          track.addEventListener(JitsiMeetJS.events.track.TRACK_STOPPED, () => {
            console.log(`${track.getType()} track stopped`);
          });
          conference.addTrack(track).catch(error => {
            console.warn('Failed to add local track to conference', error);
          });
          attachLocalTrack(track);
          syncTrackMuteState(track);
        });
      });
  }

  function syncTrackMuteState(track) {
    const type = track.getType();
    const shouldMute = type === 'audio' ? appState.audioMuted : appState.videoMuted;
    if (typeof track.isMuted === 'function' && track.isMuted() === shouldMute) {
      return;
    }

    const toggle = shouldMute ? track.mute : track.unmute;
    if (typeof toggle === 'function') {
      Promise.resolve(toggle.call(track)).catch(error => {
        console.warn(`Failed to ${shouldMute ? 'mute' : 'unmute'} ${type} track`, error);
      });
    }
  }

  function attachLocalTrack(track) {
    const type = track.getType();
    const containerId = `local-${type}`;
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.className = 'track';
      container.id = containerId;
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = `${appState.displayName} (you)`;
      container.appendChild(label);
      const mediaElement = document.createElement(type === 'video' ? 'video' : 'audio');
      mediaElement.autoplay = true;
      mediaElement.muted = true;
      mediaElement.playsInline = true;
      container.appendChild(mediaElement);
      localTracksEl.appendChild(container);
    }

    const media = container.querySelector(type === 'video' ? 'video' : 'audio');
    track.attach(media);
  }

  function attachRemoteTrack(track) {
    const participantId = track.getParticipantId();
    const type = track.getType();
    if (!appState.remoteTracks.has(participantId)) {
      appState.remoteTracks.set(participantId, new Map());
    }

    const participantTracks = appState.remoteTracks.get(participantId);
    participantTracks.set(type, track);

    const containerId = `remote-${participantId}-${type}`;
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.className = 'track';
      container.id = containerId;
      container.dataset.participant = participantId;
      const label = document.createElement('div');
      label.className = 'label';
      const participant = appState.participants.get(participantId);
      label.textContent = participant ? participant.name : `Guest ${participantId.slice(-4)}`;
      container.appendChild(label);
      const mediaElement = document.createElement(type === 'video' ? 'video' : 'audio');
      mediaElement.autoplay = true;
      mediaElement.muted = false;
      mediaElement.playsInline = true;
      container.appendChild(mediaElement);
      remoteTracksEl.appendChild(container);
    }

    const media = container.querySelector(type === 'video' ? 'video' : 'audio');
    track.attach(media);
  }

  function detachRemoteTrack(track) {
    const participantId = track.getParticipantId();
    const type = track.getType();
    const participantTracks = appState.remoteTracks.get(participantId);
    if (participantTracks) {
      participantTracks.delete(type);
      if (participantTracks.size === 0) {
        appState.remoteTracks.delete(participantId);
      }
    }

    const containerId = `remote-${participantId}-${type}`;
    const container = document.getElementById(containerId);
    if (container) {
      const media = container.querySelector(type === 'video' ? 'video' : 'audio');
      track.detach(media);
      container.remove();
    }
  }

  function removeRemoteParticipantTracks(participantId) {
    const participantTracks = appState.remoteTracks.get(participantId);
    if (!participantTracks) {
      return;
    }

    Array.from(participantTracks.values()).forEach(track => {
      detachRemoteTrack(track);
    });
  }

  function appendMessage({ author, text, timestamp, isLocal }) {
    const messageEl = document.createElement('div');
    messageEl.className = `message${isLocal ? ' local' : ''}`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const time = new Date(timestamp);
    meta.textContent = `${author} • ${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const body = document.createElement('div');
    body.className = 'body';
    body.textContent = text;
    messageEl.appendChild(meta);
    messageEl.appendChild(body);
    messagesEl.appendChild(messageEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function refreshRemoteTrackLabels(participantId) {
    const participant = appState.participants.get(participantId);
    if (!participant) {
      return;
    }

    const containers = remoteTracksEl.querySelectorAll(`.track[data-participant="${participantId}"] .label`);
    containers.forEach(labelEl => {
      labelEl.textContent = participant.name;
    });
  }

  function describeConferenceFailure(error) {
    const errors = JitsiMeetJS?.errors?.conference || {};
    switch (error) {
      case errors.AUTHENTICATION_REQUIRED:
      case errors.PASSWORD_REQUIRED:
        return 'Conference requires a password or moderator approval.';
      case errors.CONFERENCE_MAX_USERS:
        return 'Room is full. Try again later or choose another room name.';
      case errors.CONFERENCE_DESTROYED:
        return 'The conference ended. Try creating a new room.';
      case errors.FOCUS_DISCONNECTED:
      case errors.FOCUS_LEFT:
        return 'Lost connection to the Jitsi focus service. Please rejoin.';
      case errors.INCOMPATIBLE_SERVER_VERSIONS:
        return 'Incompatible Jitsi version. Refresh and try again.';
      case errors.NETWORK_FAILURE:
      case errors.SERVER_ERROR:
      case errors.JVB121_ALLOCATION_FAILED:
        return 'Temporary Jitsi server issue. Please try rejoining.';
      default:
        if (typeof error === 'string' && error.length > 0) {
          return `Conference failed: ${error}`;
        }
        return 'Conference failed. Please try rejoining.';
    }
  }

  function disconnectConference(options = {}) {
    const {
      preserveStatus = false,
      skipConnectionDisconnect = false,
      resetUi = true,
      keepLocalTracks = false
    } = options;

    clearReconnectTimer();
    appState.reconnecting = false;

    if (appState.conference) {
      const conference = appState.conference;
      appState.conference = null;
      conference.leave().catch(error => {
        console.warn('Failed to leave conference cleanly', error);
      });
    }

    for (const [participantId, participantTracks] of appState.remoteTracks.entries()) {
      for (const [type, track] of participantTracks.entries()) {
        const containerId = `remote-${participantId}-${type}`;
        const container = document.getElementById(containerId);
        if (container) {
          const media = container.querySelector(type === 'video' ? 'video' : 'audio');
          if (media) {
            track.detach(media);
          }
          container.remove();
        }
        track.dispose();
      }
    }
    appState.remoteTracks.clear();
    remoteTracksEl.innerHTML = '';

    if (!keepLocalTracks && appState.localTracks.length > 0) {
      appState.localTracks.forEach(track => {
        const type = track.getType();
        const container = document.getElementById(`local-${type}`);
        if (container) {
          const media = container.querySelector(type === 'video' ? 'video' : 'audio');
          if (media) {
            track.detach(media);
          }
          container.remove();
        }
        track.dispose();
      });
      appState.localTracks = [];
      appState.audioMuted = false;
      appState.videoMuted = false;
      toggleAudioBtn.textContent = 'Mute audio';
      toggleVideoBtn.textContent = 'Hide video';
      localTracksEl.innerHTML = '';
    }

    if (appState.connection) {
      const connection = appState.connection;
      appState.connection = null;
      if (!skipConnectionDisconnect) {
        try {
          connection.disconnect();
        } catch (error) {
          console.warn('Failed to disconnect Jitsi connection cleanly', error);
        }
      }
    }

    if (resetUi) {
      callPanel.classList.add('hidden');
      joinPanel.classList.remove('hidden');
      chatInput.value = '';
      messagesEl.innerHTML = '';
      clearParticipants();
      appState.reconnectAttempts = 0;
    } else {
      clearParticipants();
    }

    if (!preserveStatus) {
      setStatus('Disconnected', 'info');
    }

    appState.joining = false;
  }

  function startReconnect() {
    if (!appState.roomName || !appState.displayName) {
      disconnectConference({ preserveStatus: true });
      setStatus('Connection lost. Please return to the lobby and rejoin.', 'error');
      return;
    }

    if (appState.reconnectTimer) {
      return;
    }

    if (appState.reconnectAttempts >= appState.maxReconnectAttempts) {
      disconnectConference({ preserveStatus: true });
      setStatus('Unable to reconnect to Jitsi. Please try joining again.', 'error');
      return;
    }

    const attempt = ++appState.reconnectAttempts;
    const delay = Math.min(5000, attempt * 2000);
    const keepLocalTracks = appState.localTracks.length > 0;

    disconnectConference({
      preserveStatus: true,
      skipConnectionDisconnect: true,
      resetUi: false,
      keepLocalTracks
    });

    appState.reconnecting = true;
    setStatus(`Connection lost. Reconnecting (attempt ${attempt}/${appState.maxReconnectAttempts})…`, 'error');

    appState.reconnectTimer = setTimeout(() => {
      appState.reconnectTimer = null;
      if (!appState.participants.has('local')) {
        addParticipant('local', appState.displayName, true);
      }
      appState.joining = true;
      try {
        connectToConference();
      } catch (error) {
        console.error('Failed to initiate reconnect attempt', error);
        startReconnect();
      }
    }, delay);
  }

  function clearReconnectTimer() {
    if (appState.reconnectTimer) {
      clearTimeout(appState.reconnectTimer);
      appState.reconnectTimer = null;
    }
  }
})();
