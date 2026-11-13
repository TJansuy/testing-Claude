"""UPnP service descriptions (SCPD) for the MediaRenderer, built from compact tables."""
from __future__ import annotations

# action -> [(argument, direction, related state variable)]
AV_TRANSPORT = {
    "SetAVTransportURI": [("InstanceID", "in", "A_ARG_TYPE_InstanceID"),
                          ("CurrentURI", "in", "AVTransportURI"),
                          ("CurrentURIMetaData", "in", "AVTransportURIMetaData")],
    "SetNextAVTransportURI": [("InstanceID", "in", "A_ARG_TYPE_InstanceID"),
                              ("NextURI", "in", "NextAVTransportURI"),
                              ("NextURIMetaData", "in", "NextAVTransportURIMetaData")],
    "GetMediaInfo": [("InstanceID", "in", "A_ARG_TYPE_InstanceID"),
                     ("NrTracks", "out", "NumberOfTracks"),
                     ("MediaDuration", "out", "CurrentMediaDuration"),
                     ("CurrentURI", "out", "AVTransportURI"),
                     ("CurrentURIMetaData", "out", "AVTransportURIMetaData"),
                     ("NextURI", "out", "NextAVTransportURI"),
                     ("NextURIMetaData", "out", "NextAVTransportURIMetaData"),
                     ("PlayMedium", "out", "PlaybackStorageMedium"),
                     ("RecordMedium", "out", "RecordStorageMedium"),
                     ("WriteStatus", "out", "RecordMediumWriteStatus")],
    "GetTransportInfo": [("InstanceID", "in", "A_ARG_TYPE_InstanceID"),
                         ("CurrentTransportState", "out", "TransportState"),
                         ("CurrentTransportStatus", "out", "TransportStatus"),
                         ("CurrentSpeed", "out", "TransportPlaySpeed")],
    "GetPositionInfo": [("InstanceID", "in", "A_ARG_TYPE_InstanceID"),
                        ("Track", "out", "CurrentTrack"),
                        ("TrackDuration", "out", "CurrentTrackDuration"),
                        ("TrackMetaData", "out", "CurrentTrackMetaData"),
                        ("TrackURI", "out", "CurrentTrackURI"),
                        ("RelTime", "out", "RelativeTimePosition"),
                        ("AbsTime", "out", "AbsoluteTimePosition"),
                        ("RelCount", "out", "RelativeCounterPosition"),
                        ("AbsCount", "out", "AbsoluteCounterPosition")],
    "GetDeviceCapabilities": [("InstanceID", "in", "A_ARG_TYPE_InstanceID"),
                              ("PlayMedia", "out", "PossiblePlaybackStorageMedia"),
                              ("RecMedia", "out", "PossibleRecordStorageMedia"),
                              ("RecQualityModes", "out", "PossibleRecordQualityModes")],
    "GetTransportSettings": [("InstanceID", "in", "A_ARG_TYPE_InstanceID"),
                             ("PlayMode", "out", "CurrentPlayMode"),
                             ("RecQualityMode", "out", "CurrentRecordQualityMode")],
    "Stop": [("InstanceID", "in", "A_ARG_TYPE_InstanceID")],
    "Play": [("InstanceID", "in", "A_ARG_TYPE_InstanceID"),
             ("Speed", "in", "TransportPlaySpeed")],
    "Pause": [("InstanceID", "in", "A_ARG_TYPE_InstanceID")],
    "Seek": [("InstanceID", "in", "A_ARG_TYPE_InstanceID"),
             ("Unit", "in", "A_ARG_TYPE_SeekMode"),
             ("Target", "in", "A_ARG_TYPE_SeekTarget")],
    "GetCurrentTransportActions": [("InstanceID", "in", "A_ARG_TYPE_InstanceID"),
                                   ("Actions", "out", "CurrentTransportActions")],
}

_CHANNEL = [("InstanceID", "in", "A_ARG_TYPE_InstanceID"), ("Channel", "in", "A_ARG_TYPE_Channel")]
RENDERING_CONTROL = {
    "ListPresets": [("InstanceID", "in", "A_ARG_TYPE_InstanceID"),
                    ("CurrentPresetNameList", "out", "PresetNameList")],
    "SelectPreset": [("InstanceID", "in", "A_ARG_TYPE_InstanceID"),
                     ("PresetName", "in", "A_ARG_TYPE_PresetName")],
    "GetMute": _CHANNEL + [("CurrentMute", "out", "Mute")],
    "SetMute": _CHANNEL + [("DesiredMute", "in", "Mute")],
    "GetVolume": _CHANNEL + [("CurrentVolume", "out", "Volume")],
    "SetVolume": _CHANNEL + [("DesiredVolume", "in", "Volume")],
}

CONNECTION_MANAGER = {
    "GetProtocolInfo": [("Source", "out", "SourceProtocolInfo"),
                        ("Sink", "out", "SinkProtocolInfo")],
    "GetCurrentConnectionIDs": [("ConnectionIDs", "out", "CurrentConnectionIDs")],
    "GetCurrentConnectionInfo": [("ConnectionID", "in", "A_ARG_TYPE_ConnectionID"),
                                 ("RcsID", "out", "A_ARG_TYPE_RcsID"),
                                 ("AVTransportID", "out", "A_ARG_TYPE_AVTransportID"),
                                 ("ProtocolInfo", "out", "A_ARG_TYPE_ProtocolInfo"),
                                 ("PeerConnectionManager", "out", "A_ARG_TYPE_ConnectionManager"),
                                 ("PeerConnectionID", "out", "A_ARG_TYPE_ConnectionID"),
                                 ("Direction", "out", "A_ARG_TYPE_Direction"),
                                 ("Status", "out", "A_ARG_TYPE_ConnectionStatus")],
}

SERVICES = {
    "AVTransport": AV_TRANSPORT,
    "RenderingControl": RENDERING_CONTROL,
    "ConnectionManager": CONNECTION_MANAGER,
}

TYPES = {
    "A_ARG_TYPE_InstanceID": "ui4", "NumberOfTracks": "ui4", "CurrentTrack": "ui4",
    "RelativeCounterPosition": "i4", "AbsoluteCounterPosition": "i4",
    "Mute": "boolean", "Volume": "ui2", "A_ARG_TYPE_ConnectionID": "i4",
    "A_ARG_TYPE_RcsID": "i4", "A_ARG_TYPE_AVTransportID": "i4",
}

ALLOWED = {
    "A_ARG_TYPE_Channel": ["Master"],
    "A_ARG_TYPE_SeekMode": ["REL_TIME", "ABS_TIME"],
    "A_ARG_TYPE_Direction": ["Input", "Output"],
}


def service_type(name: str) -> str:
    return f"urn:schemas-upnp-org:service:{name}:1"


def scpd_xml(name: str) -> str:
    actions = SERVICES[name]
    parts = ['<?xml version="1.0" encoding="utf-8"?>',
             '<scpd xmlns="urn:schemas-upnp-org:service-1-0">',
             "<specVersion><major>1</major><minor>0</minor></specVersion><actionList>"]
    variables: list[str] = []
    for action, args in actions.items():
        parts.append(f"<action><name>{action}</name><argumentList>")
        for arg, direction, var in args:
            parts.append(f"<argument><name>{arg}</name><direction>{direction}</direction>"
                         f"<relatedStateVariable>{var}</relatedStateVariable></argument>")
            if var not in variables:
                variables.append(var)
        parts.append("</argumentList></action>")
    parts.append("</actionList><serviceStateTable>")
    if name != "ConnectionManager":
        parts.append('<stateVariable sendEvents="yes"><name>LastChange</name>'
                     "<dataType>string</dataType></stateVariable>")
    for var in variables:
        parts.append(f'<stateVariable sendEvents="no"><name>{var}</name>'
                     f"<dataType>{TYPES.get(var, 'string')}</dataType>")
        if var in ALLOWED:
            parts.append("<allowedValueList>" + "".join(
                f"<allowedValue>{v}</allowedValue>" for v in ALLOWED[var]) + "</allowedValueList>")
        if var == "Volume":
            parts.append("<allowedValueRange><minimum>0</minimum><maximum>100</maximum>"
                         "<step>1</step></allowedValueRange>")
        parts.append("</stateVariable>")
    parts.append("</serviceStateTable></scpd>")
    return "".join(parts)
