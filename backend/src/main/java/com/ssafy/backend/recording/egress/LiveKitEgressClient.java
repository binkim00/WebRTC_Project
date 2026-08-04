package com.ssafy.backend.recording.egress;

import io.livekit.server.EgressServiceClient;
import livekit.LivekitEgress;
import org.springframework.stereotype.Component;
import retrofit2.Response;

import java.io.IOException;

/** LiveKit Java SDK의 Egress 시작·중지 호출과 응답 검증을 한곳에 모은다. */
@Component
public class LiveKitEgressClient {

    private final EgressServiceClient client;

    public LiveKitEgressClient(EgressServiceClient client) {
        this.client = client;
    }

    /** 720p 30fps MP4 Room Composite 녹화를 시작한다. */
    public LivekitEgress.EgressInfo startRoomComposite(
            String roomName, String outputPath, String layout
    ) {
        LivekitEgress.EncodedFileOutput output = LivekitEgress.EncodedFileOutput.newBuilder()
                .setFileType(LivekitEgress.EncodedFileType.MP4)
                .setFilepath(outputPath)
                .build();
        try {
            Response<LivekitEgress.EgressInfo> response = client.startRoomCompositeEgress(
                    roomName,
                    output,
                    layout,
                    LivekitEgress.EncodingOptionsPreset.H264_720P_30
            ).execute();
            return requireBody(response, "EGRESS_START_REJECTED");
        } catch (IOException exception) {
            throw new RecordingEgressException(
                    "EGRESS_START_IO_ERROR", "Egress 시작 요청에 실패했습니다.", exception);
        }
    }

    /** 지정 Egress 작업의 MP4 마감을 요청한다. */
    public LivekitEgress.EgressInfo stop(String egressId) {
        try {
            Response<LivekitEgress.EgressInfo> response = client.stopEgress(egressId).execute();
            return requireBody(response, "EGRESS_STOP_REJECTED");
        } catch (IOException exception) {
            throw new RecordingEgressException(
                    "EGRESS_STOP_IO_ERROR", "Egress 중지 요청에 실패했습니다.", exception);
        }
    }

    private LivekitEgress.EgressInfo requireBody(
            Response<LivekitEgress.EgressInfo> response, String failureCode
    ) {
        if (!response.isSuccessful() || response.body() == null) {
            throw new RecordingEgressException(
                    failureCode, "LiveKit Egress API가 성공 응답을 반환하지 않았습니다. httpStatus="
                    + response.code());
        }
        return response.body();
    }
}
