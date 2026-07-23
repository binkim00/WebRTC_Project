package com.ssafy.backend;

import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest(properties = {
		"spring.docker.compose.enabled=false",
		"spring.autoconfigure.exclude="
				+ "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
				+ "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
		"livekit.url=wss://test.livekit.invalid",
		"livekit.api-key=test-api-key",
		"livekit.api-secret=test-api-secret"
})
class BackendApplicationTests {

	@MockitoBean
	private UserRepository userRepository;

	/** DB 자동 구성 없이도 Spring 애플리케이션 컨텍스트가 정상적으로 시작되는지 확인한다. */
	@Test
	void contextLoads() {
	}

}
