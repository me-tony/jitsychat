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
    joining: false
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
    const room = (formData.get('room') || '').toString().trim();
    const name = (formData.get('displayName') || '').toString().trim();

    if (!room || !name) {
      setStatus('Room name and display name are required', 'error');
      return;
    }

    appState.roomName = room;
    appState.displayName = name;
    appState.joining = true;
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
    disconnectConference();
  });

  window.addEventListener('beforeunload', () => {
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
        muc: 'conference.meet.jit.si'
      },
      serviceUrl: `wss://${domain}/xmpp-websocket?room=${encodeURIComponent(appState.roomName)}`,
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

    conference.join();

    JitsiMeetJS.createLocalTracks({ devices: ['audio', 'video'] })
      .then(tracks => {
        tracks.forEach(track => {
          appState.localTracks.push(track);
          track.addEventListener(JitsiMeetJS.events.track.TRACK_STOPPED, () => {
            console.log(`${track.getType()} track stopped`);
          });
          conference.addTrack(track);
          attachLocalTrack(track);
        });
      })
      .catch(error => {
        console.error('Failed to create local tracks', error);
        setStatus('Could not access camera/microphone. Check permissions.', 'error');
      });
  }

  function onConnectionFailed(error) {
    console.error('Connection failed', error);
    disconnectConference({ preserveStatus: true });
    setStatus('Connection failed. Please try again.', 'error');
  }

  function onConnectionDisconnected() {
    setStatus('Disconnected', 'info');
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
    const mapKey = `${participantId}-${type}`;
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

  function disconnectConference(options = {}) {
    const { preserveStatus = false } = options;
    if (appState.localTracks.length > 0) {
      appState.localTracks.forEach(track => {
        track.dispose();
      });
      appState.localTracks = [];
      localTracksEl.innerHTML = '';
    }

    for (const participantTracks of appState.remoteTracks.values()) {
      for (const track of participantTracks.values()) {
        track.dispose();
      }
    }
    appState.remoteTracks.clear();
    remoteTracksEl.innerHTML = '';

    if (appState.conference) {
      const conference = appState.conference;
      appState.conference = null;
      conference.leave().catch(error => {
        console.warn('Failed to leave conference cleanly', error);
      });
    }

    if (appState.connection) {
      const connection = appState.connection;
      appState.connection = null;
      connection.disconnect();
    }

    if (!preserveStatus) {
      setStatus('Disconnected', 'info');
    }
    callPanel.classList.add('hidden');
    joinPanel.classList.remove('hidden');
    chatInput.value = '';
    messagesEl.innerHTML = '';
    clearParticipants();
    appState.audioMuted = false;
    appState.videoMuted = false;
    toggleAudioBtn.textContent = 'Mute audio';
    toggleVideoBtn.textContent = 'Hide video';
  }
})();
