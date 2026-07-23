// 처음부터 모든 페이지 불러오기보다 사용자가 해당 URL에 접근할 때 페이지 코드를 불러오기

import type { ComponentType } from "react";

type PageModule = {
    default: ComponentType;
};

export function lazyPage(importer: () => Promise<PageModule>) {
    return async () => {
        const module = await importer();

        return {
            Component: module.default,
        };
    };
}