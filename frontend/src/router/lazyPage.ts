// 처음부터 모든 페이지 불러오기보다 사용자가 해당 URL에 접근할 때 페이지 코드를 불러오기

import type { ComponentType } from "react";

/**
 * 라우트 모듈의 특정 named export를 React Router의 lazy 형식으로 변환한다.
 * 페이지를 실제 방문할 때만 내려받게 해 초기 번들에서 LiveKit·운영 화면 코드를 분리한다.
 */
export function lazyPage<Module, ExportName extends keyof Module>(
    importer: () => Promise<Module>,
    exportName: ExportName,
) {
    return async () => {
        const module = await importer();

        return {
            Component: module[exportName] as ComponentType,
        };
    };
}
