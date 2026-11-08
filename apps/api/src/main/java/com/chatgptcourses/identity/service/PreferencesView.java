package com.chatgptcourses.identity.service;

import java.util.UUID;

public record PreferencesView(UUID id, String locale, long revision) { }
