package com.ssafy.backend.livekit.service;

import io.livekit.server.RoomServiceClient;
import livekit.LivekitModels;
import org.junit.jupiter.api.Test;
import retrofit2.Call;
import retrofit2.Response;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LiveKitRoomParticipantServiceTest {

    /** call_session_id가 일치하는 팬 identity만 공유 Room에서 제거하는지 검증한다. */
    @Test
    @SuppressWarnings("unchecked")
    void removesOnlyFanForRequestedCallSession() throws IOException {
        RoomServiceClient client = mock(RoomServiceClient.class);
        Call<List<LivekitModels.ParticipantInfo>> listCall = mock(Call.class);
        Call<Void> removeCall = mock(Call.class);
        LivekitModels.ParticipantInfo otherFan = participant("other-fan", "99");
        LivekitModels.ParticipantInfo targetFan = participant("target-fan", "100");
        when(client.listParticipants("meeting-room-1")).thenReturn(listCall);
        when(listCall.execute()).thenReturn(Response.success(List.of(otherFan, targetFan)));
        when(client.removeParticipant("meeting-room-1", "target-fan")).thenReturn(removeCall);
        when(removeCall.execute()).thenReturn(Response.success(null));
        LiveKitRoomParticipantService service = new LiveKitRoomParticipantService(client);

        service.removeFan("meeting-room-1", 100L);

        verify(client).removeParticipant("meeting-room-1", "target-fan");
    }

    /** 테스트에 사용할 LiveKit 참가자와 통화 세션 attribute를 생성한다. */
    private LivekitModels.ParticipantInfo participant(String identity, String callSessionId) {
        return LivekitModels.ParticipantInfo.newBuilder()
                .setIdentity(identity)
                .putAllAttributes(Map.of("call_session_id", callSessionId))
                .build();
    }
}
